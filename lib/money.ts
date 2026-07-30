/**
 * One pound-and-pence formatter for every card, email and page in the product.
 *
 * Pence in full or not at all — "£23.50" not "£23.5", which reads as a typo next
 * to "£16.95". Whole rates stay clean: £14, not £14.00.
 *
 * This has its own module rather than living beside one of its callers because
 * the bug it fixes has now been found TWICE: once on the job card (96ac8ea) and
 * again on the shift card, which had its own `£${rate}/${type}` and so printed
 * £12.5 in the same feed as £18.16. Both formatters were correct when written;
 * they diverged because there were two. A leaf module both sides can import
 * without either depending on the other is what stops that happening a third
 * time — jobCard and tempWork import each other's ideas, so neither could own it.
 */
export function formatMoney(n: number): string {
  return `£${Number.isInteger(n) ? n : n.toFixed(2)}`
}
