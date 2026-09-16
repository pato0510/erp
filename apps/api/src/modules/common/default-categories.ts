import { CategoryType, Prisma } from '@prisma/client';

export const SALES_INCOME_CATEGORY_NAME = 'Ingresos por Ventas';
export const UNCATEGORIZED_CATEGORY_NAME = 'Productos no categorizados';

/** Same company/name/type identity as the SII upserts. Sales income is final,
 * not pending. Read only: previews and list requests must never seed categories. */
export async function resolveDefaultCategoryIds(
  companyId: string,
  client: Pick<Prisma.TransactionClient, 'category'>,
): Promise<string[]> {
  const categories = await client.category.findMany({
    where: {
      companyId,
      name: UNCATEGORIZED_CATEGORY_NAME,
      type: { in: [CategoryType.INCOME, CategoryType.EXPENSE] },
    },
    select: { id: true },
  });
  return categories.map((category) => category.id);
}
