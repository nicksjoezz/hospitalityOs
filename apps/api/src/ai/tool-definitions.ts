import type Anthropic from '@anthropic-ai/sdk';

/**
 * Tool definitions the AI may call (plan.md §7.4). Each maps to a deterministic
 * service method. `audience` controls exposure: guest conversations get only
 * guest-safe tools; staff get role-appropriate tools (enforced again at execution).
 */
export type ToolAudience = 'guest' | 'staff';

export interface ToolDef {
  audience: ToolAudience[];
  tool: Anthropic.Tool;
}

export const TOOL_DEFS: Record<string, ToolDef> = {
  check_availability: {
    audience: ['guest', 'staff'],
    tool: {
      name: 'check_availability',
      description:
        'Check room availability for a date range. Returns available room types with prices. Always use this before quoting or booking — never guess availability.',
      input_schema: {
        type: 'object',
        properties: {
          checkIn: { type: 'string', description: 'Check-in date YYYY-MM-DD' },
          checkOut: { type: 'string', description: 'Check-out date YYYY-MM-DD' },
          roomTypeId: { type: 'string', description: 'Optional room type id' },
        },
        required: ['checkIn', 'checkOut'],
      },
    },
  },
  quote_price: {
    audience: ['guest', 'staff'],
    tool: {
      name: 'quote_price',
      description:
        'Get the authoritative total price for a room type over a date range.',
      input_schema: {
        type: 'object',
        properties: {
          roomTypeId: { type: 'string' },
          checkIn: { type: 'string', description: 'YYYY-MM-DD' },
          checkOut: { type: 'string', description: 'YYYY-MM-DD' },
        },
        required: ['roomTypeId', 'checkIn', 'checkOut'],
      },
    },
  },
  create_reservation: {
    audience: ['guest', 'staff'],
    tool: {
      name: 'create_reservation',
      description:
        'Create a confirmed reservation. Requires guest name and phone. Only call after confirming availability and price with the guest.',
      input_schema: {
        type: 'object',
        properties: {
          guestName: { type: 'string' },
          guestPhone: { type: 'string' },
          roomTypeId: { type: 'string' },
          checkIn: { type: 'string', description: 'YYYY-MM-DD' },
          checkOut: { type: 'string', description: 'YYYY-MM-DD' },
        },
        required: ['guestName', 'guestPhone', 'roomTypeId', 'checkIn', 'checkOut'],
      },
    },
  },
  get_reservation: {
    audience: ['guest', 'staff'],
    tool: {
      name: 'get_reservation',
      description:
        "Look up a reservation by its id or by the guest's phone number.",
      input_schema: {
        type: 'object',
        properties: {
          reservationId: { type: 'string' },
          guestPhone: { type: 'string' },
        },
      },
    },
  },
  register_maintenance_issue: {
    audience: ['guest', 'staff'],
    tool: {
      name: 'register_maintenance_issue',
      description:
        'Report a maintenance problem (e.g. AC not cooling, leaking tap). Creates a ticket for the maintenance team.',
      input_schema: {
        type: 'object',
        properties: {
          roomId: { type: 'string', description: 'Room id if known' },
          category: {
            type: 'string',
            enum: [
              'HVAC',
              'PLUMBING',
              'ELECTRICAL',
              'FURNITURE',
              'APPLIANCE',
              'STRUCTURAL',
              'NETWORK_TV',
              'GENERATOR_POWER',
              'OTHER',
            ],
          },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
          title: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['category', 'title', 'description'],
      },
    },
  },
  raise_complaint: {
    audience: ['guest'],
    tool: {
      name: 'raise_complaint',
      description: 'Record a guest complaint so management can follow up.',
      input_schema: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['category', 'description'],
      },
    },
  },
  // ---- Staff-only ----
  list_room_status: {
    audience: ['staff'],
    tool: {
      name: 'list_room_status',
      description: 'List rooms and their current status (optionally filtered).',
      input_schema: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Optional RoomStatus filter' },
        },
      },
    },
  },
  update_maintenance_ticket: {
    audience: ['staff'],
    tool: {
      name: 'update_maintenance_ticket',
      description: 'Update the status of a maintenance ticket.',
      input_schema: {
        type: 'object',
        properties: {
          ticketId: { type: 'string' },
          status: {
            type: 'string',
            enum: [
              'OPEN',
              'ACKNOWLEDGED',
              'ASSIGNED',
              'IN_PROGRESS',
              'ON_HOLD',
              'RESOLVED',
              'CLOSED',
              'CANCELLED',
            ],
          },
          note: { type: 'string' },
        },
        required: ['ticketId', 'status'],
      },
    },
  },
  update_housekeeping_task: {
    audience: ['staff'],
    tool: {
      name: 'update_housekeeping_task',
      description:
        'Update a housekeeping task you are assigned: start, complete, or (supervisor) inspect.',
      input_schema: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          action: { type: 'string', enum: ['start', 'complete', 'inspect'] },
          result: { type: 'string', enum: ['PASS', 'FAIL'] },
          note: { type: 'string' },
        },
        required: ['taskId', 'action'],
      },
    },
  },
  get_dashboard_snapshot: {
    audience: ['staff'],
    tool: {
      name: 'get_dashboard_snapshot',
      description:
        'Get the current operational snapshot (occupancy, revenue, alerts, etc.) for the hotel.',
      input_schema: { type: 'object', properties: {} },
    },
  },
  get_stock_levels: {
    audience: ['staff'],
    tool: {
      name: 'get_stock_levels',
      description: 'List inventory stock levels, optionally filtered by category.',
      input_schema: {
        type: 'object',
        properties: { category: { type: 'string' } },
      },
    },
  },
  log_wastage: {
    audience: ['staff'],
    tool: {
      name: 'log_wastage',
      description: 'Log wasted/spoiled inventory, decrementing stock.',
      input_schema: {
        type: 'object',
        properties: {
          itemId: { type: 'string' },
          quantity: { type: 'number' },
          reason: { type: 'string' },
        },
        required: ['itemId', 'quantity', 'reason'],
      },
    },
  },
  get_loss_alerts: {
    audience: ['staff'],
    tool: {
      name: 'get_loss_alerts',
      description: 'Get current inventory loss/shrinkage alerts (theoretical vs actual).',
      input_schema: { type: 'object', properties: {} },
    },
  },
  create_order: {
    audience: ['staff'],
    tool: {
      name: 'create_order',
      description: 'Create a restaurant/bar/room-service order with menu item lines.',
      input_schema: {
        type: 'object',
        properties: {
          outlet: { type: 'string', enum: ['RESTAURANT', 'BAR', 'ROOM_SERVICE'] },
          roomId: { type: 'string' },
          reservationId: { type: 'string' },
          tableNo: { type: 'string' },
          lines: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                menuItemId: { type: 'string' },
                quantity: { type: 'number' },
              },
              required: ['menuItemId', 'quantity'],
            },
          },
        },
        required: ['outlet', 'lines'],
      },
    },
  },
  draft_purchase_order: {
    audience: ['staff'],
    tool: {
      name: 'draft_purchase_order',
      description:
        'Draft a purchase order from items at/below reorder point for a supplier. Drafting only — sending requires manager approval.',
      input_schema: {
        type: 'object',
        properties: { supplierId: { type: 'string' } },
        required: ['supplierId'],
      },
    },
  },
  submit_staff_report: {
    audience: ['staff'],
    tool: {
      name: 'submit_staff_report',
      description:
        'Submit a confidential report about another worker. Only OWNER/MANAGER can read it; the subject never sees it. Supports an anonymous option.',
      input_schema: {
        type: 'object',
        properties: {
          subjectUserId: { type: 'string' },
          subjectFreeText: { type: 'string', description: 'Named person if not a user id' },
          category: {
            type: 'string',
            enum: [
              'MISCONDUCT',
              'ABSENCE',
              'POLICY_VIOLATION',
              'SAFETY',
              'THEFT_SUSPICION',
              'PERFORMANCE',
              'HARASSMENT',
              'PRAISE',
              'OTHER',
            ],
          },
          severity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
          title: { type: 'string' },
          description: { type: 'string' },
          anonymous: { type: 'boolean' },
        },
        required: ['category', 'title', 'description'],
      },
    },
  },
  get_bank_transfer_details: {
    audience: ['guest', 'staff'],
    tool: {
      name: 'get_bank_transfer_details',
      description:
        'Get bank transfer payment details (dedicated virtual account) for a reservation so the guest can pay via bank transfer.',
      input_schema: {
        type: 'object',
        properties: {
          reservationId: { type: 'string', description: 'UUID of the reservation' },
        },
        required: ['reservationId'],
      },
    },
  },
  pre_checkin_details: {
    audience: ['guest', 'staff'],
    tool: {
      name: 'pre_checkin_details',
      description:
        'Record guest pre-arrival details such as estimated arrival time, dietary restrictions, or preferences.',
      input_schema: {
        type: 'object',
        properties: {
          reservationId: { type: 'string' },
          estimatedArrivalTime: { type: 'string' },
          specialRequests: { type: 'string' },
          dietaryRestrictions: { type: 'string' },
        },
        required: ['reservationId'],
      },
    },
  },
};

export function toolsForAudience(audience: ToolAudience): Anthropic.Tool[] {
  return Object.values(TOOL_DEFS)
    .filter((d) => d.audience.includes(audience))
    .map((d) => d.tool);
}
