import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Outlet } from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { Actor } from '../common/actor';

/** Menu & recipe management (plan.md §6.6, §11.4). */
@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  createCategory(actor: Actor, input: { name: string; outlet: Outlet }) {
    return this.prisma.menuCategory.create({
      data: { hotelId: actor.hotelId, name: input.name, outlet: input.outlet },
    });
  }

  listCategories(hotelId: string, outlet?: Outlet) {
    return this.prisma.menuCategory.findMany({
      where: { hotelId, ...(outlet ? { outlet } : {}) },
      include: { items: true },
      orderBy: { name: 'asc' },
    });
  }

  createItem(
    actor: Actor,
    input: { categoryId: string; name: string; price: number; recipeId?: string },
  ) {
    return this.prisma.menuItem.create({
      data: {
        hotelId: actor.hotelId,
        categoryId: input.categoryId,
        name: input.name,
        price: input.price,
        recipeId: input.recipeId,
      },
    });
  }

  listItems(hotelId: string) {
    return this.prisma.menuItem.findMany({
      where: { hotelId },
      include: { recipe: { include: { ingredients: true } } },
      orderBy: { name: 'asc' },
    });
  }

  /** Create a recipe linking a dish to inventory ingredients (theoretical usage). */
  async createRecipe(
    actor: Actor,
    input: {
      name: string;
      yieldQty?: number;
      yieldUnit?: string;
      ingredients: { inventoryItemId: string; quantity: number; unit: string }[];
    },
  ) {
    return this.prisma.recipe.create({
      data: {
        hotelId: actor.hotelId,
        name: input.name,
        yieldQty: new Prisma.Decimal(input.yieldQty ?? 1),
        yieldUnit: input.yieldUnit ?? 'serving',
        ingredients: {
          create: input.ingredients.map((i) => ({
            inventoryItemId: i.inventoryItemId,
            quantity: new Prisma.Decimal(i.quantity),
            unit: i.unit,
          })),
        },
      },
      include: { ingredients: true },
    });
  }

  async attachRecipe(actor: Actor, menuItemId: string, recipeId: string) {
    const item = await this.prisma.menuItem.findFirst({
      where: { id: menuItemId, hotelId: actor.hotelId },
    });
    if (!item) throw new NotFoundException('Menu item not found');
    return this.prisma.menuItem.update({
      where: { id: menuItemId },
      data: { recipeId },
    });
  }
}
