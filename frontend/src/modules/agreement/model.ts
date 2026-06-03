export interface Reference {
  id?: string;
  name?: string;
}

export interface AgreementContext {
  data?: {
    agreement?: Reference;
  };
}

export interface AgreementParameter {
  displayValue?: string;
  externalId?: string;
  id?: string;
  name?: string;
  phase?: string;
  scope?: string;
  value?: unknown;
  type?: string;
  multiple?: boolean;
}

export interface Agreement {
  id: string;
  status?: string;
  parameters?: {
    fulfillment?: AgreementParameter[];
  };
}

export interface AdobeCustomer {
  status?: string;
  error?: string | null;
}

export function resolveAgreementId(context?: AgreementContext): string {
  return context?.data?.agreement?.id?.trim() ?? '';
}

export function readParameter(
  parameters: AgreementParameter[] | undefined,
  externalId: string,
): unknown {
  return parameters?.find((parameter) => parameter.externalId === externalId)?.value;
}
