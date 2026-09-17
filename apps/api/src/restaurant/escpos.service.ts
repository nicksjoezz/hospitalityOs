import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Standard ESC/POS Control byte sequences */
const ESC = '\x1b';
const GS = '\x1d';

const COMMANDS = {
  INIT: `${ESC}@`,
  ALIGN_LEFT: `${ESC}a\x00`,
  ALIGN_CENTER: `${ESC}a\x01`,
  ALIGN_RIGHT: `${ESC}a\x02`,
  BOLD_ON: `${ESC}E\x01`,
  BOLD_OFF: `${ESC}E\x00`,
  DOUBLE_HEIGHT_ON: `${GS}!\x10`,
  DOUBLE_WIDTH_ON: `${GS}!\x20`,
  DOUBLE_SIZE_ON: `${GS}!\x30`,
  NORMAL_SIZE: `${GS}!\x00`,
  CUT_FULL: `${GS}V\x41\x00`,
  CUT_PARTIAL: `${GS}V\x42\x00`,
  BEEP: `${ESC}B\x03\x02`, // 3 beeps, 200ms
  DRAWER_KICK: `${ESC}p\x00\x19\xfa`, // pulse cash drawer pin 2
};

@Injectable()
export class EscposService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates ESC/POS byte buffers and readable ASCII preview for guest receipt or KOT.
   */
  async generateOrderReceipt(hotelId: string, orderId: string, type: 'receipt' | 'kot' = 'receipt') {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, hotelId },
      include: {
        lines: {
          where: { voided: false },
          include: { menuItem: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const hotel = await this.prisma.hotel.findUnique({
      where: { id: hotelId },
    });

    let roomNumber: string | undefined;
    if (order.roomId) {
      const room = await this.prisma.room.findUnique({
        where: { id: order.roomId },
        select: { roomNumber: true },
      });
      roomNumber = room?.roomNumber;
    }

    const isKot = type === 'kot';
    const currency = hotel?.currency || 'NGN';
    const width = 42; // standard 80mm printer character width

    let buffer = COMMANDS.INIT;
    let ascii = '';

    const addLine = (text = '', escCmd = '') => {
      buffer += escCmd + text + '\n';
      ascii += text + '\n';
    };

    const addDivider = (char = '-') => {
      const div = char.repeat(width);
      addLine(div);
    };

    const padRow = (left: string, right: string) => {
      const spaceCount = Math.max(1, width - left.length - right.length);
      return left + ' '.repeat(spaceCount) + right;
    };

    if (isKot) {
      // Kitchen / Bar Order Ticket
      addLine('*** KITCHEN ORDER TICKET ***', COMMANDS.ALIGN_CENTER + COMMANDS.DOUBLE_SIZE_ON + COMMANDS.BOLD_ON);
      addLine('', COMMANDS.NORMAL_SIZE);

      const destination = order.tableNo
        ? `TABLE #${order.tableNo}`
        : roomNumber
        ? `ROOM #${roomNumber}`
        : 'WALK-IN / TAKEAWAY';
      addLine(destination, COMMANDS.ALIGN_CENTER + COMMANDS.DOUBLE_SIZE_ON + COMMANDS.BOLD_ON);
      addLine('', COMMANDS.NORMAL_SIZE + COMMANDS.ALIGN_LEFT);
      addLine(`Order #: ${order.id.slice(0, 8).toUpperCase()}`);
      addLine(`Outlet:  ${order.outlet}`);
      addLine(`Time:    ${order.at.toLocaleTimeString('en-US', { hour12: false })}`);
      if (order.note) {
        addLine(`Note:    ${order.note}`);
      }
      addDivider('=');

      for (const line of order.lines) {
        const itemLine = `[${line.quantity}x] ${line.menuItem.name}`;
        addLine(itemLine, COMMANDS.BOLD_ON + COMMANDS.DOUBLE_HEIGHT_ON);
      }

      addDivider('=');
      addLine(`Total Items: ${order.lines.reduce((s, l) => s + l.quantity, 0)}`, COMMANDS.NORMAL_SIZE);
      buffer += COMMANDS.BEEP;
      buffer += '\n\n\n' + COMMANDS.CUT_PARTIAL;
    } else {
      // Customer Payment Receipt
      addLine((hotel?.name ?? 'HOTEL').toUpperCase(), COMMANDS.ALIGN_CENTER + COMMANDS.DOUBLE_SIZE_ON + COMMANDS.BOLD_ON);
      if (hotel?.address) {
        addLine(hotel.address, COMMANDS.NORMAL_SIZE + COMMANDS.ALIGN_CENTER);
      }
      if (hotel?.phone) {
        addLine(`Tel: ${hotel.phone}`, COMMANDS.NORMAL_SIZE + COMMANDS.ALIGN_CENTER);
      }
      addDivider();

      addLine(`Receipt #: ${order.id.slice(0, 8).toUpperCase()}`, COMMANDS.ALIGN_LEFT);
      addLine(`Date:      ${order.at.toLocaleDateString()} ${order.at.toLocaleTimeString()}`);
      if (order.tableNo) addLine(`Table:     #${order.tableNo}`);
      if (roomNumber) addLine(`Room:      #${roomNumber}`);
      addLine(`Outlet:    ${order.outlet}`);
      addDivider();

      // Column Header
      addLine(padRow('ITEM', 'TOTAL'));
      addDivider('-');

      for (const line of order.lines) {
        const priceStr = `${currency} ${(line.lineTotal / 100).toFixed(2)}`;
        const itemName = `${line.quantity}x ${line.menuItem.name}`;
        if (itemName.length + priceStr.length > width) {
          addLine(itemName);
          addLine(padRow('', priceStr));
        } else {
          addLine(padRow(itemName, priceStr));
        }
      }

      addDivider();
      addDivider('=');
      addLine(
        padRow('TOTAL DUE:', `${currency} ${(order.total / 100).toFixed(2)}`),
        COMMANDS.BOLD_ON + COMMANDS.DOUBLE_HEIGHT_ON,
      );
      addLine('', COMMANDS.NORMAL_SIZE);
      addLine(`Status: ${order.status}`);
      addDivider();
      addLine('Thank you for dining with us!', COMMANDS.ALIGN_CENTER);
      addLine('Powered by HospitalityOS', COMMANDS.ALIGN_CENTER);
      buffer += '\n\n\n' + COMMANDS.CUT_FULL;
    }

    const rawBase64 = Buffer.from(buffer, 'binary').toString('base64');

    return {
      orderId: order.id,
      type,
      asciiText: ascii,
      rawBase64,
      filename: `${type}_${order.id.slice(0, 8)}.bin`,
    };
  }
}
