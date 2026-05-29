export interface Reference {
  id?: string;
  name?: string;
}

export interface AgreementContext {
  data?: {
    agreement?: Reference;
  };
}

export function resolveAgreementId(context?: AgreementContext): string {
  return context?.data?.agreement?.id?.trim() ?? '';
}
