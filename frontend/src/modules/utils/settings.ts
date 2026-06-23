import { ProductSegment } from "../shared/hooks/useSettings";

export function getProduct(products: ProductSegment[] | undefined, productId: string) {
  return products?.find((product) => product.id === productId);
}
