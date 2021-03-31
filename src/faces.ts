import { Subscriber, Observable } from "rxjs";
import { GQLTransactionInterface } from "ardb/lib/faces/gql";

// Types for the upload function

export interface UploadFunctionReturn {
  data: any;
  tags?: { name: string; value: string }[];
}

export type UploadFunction = (
  subscriber: Subscriber<UploadFunctionReturn>,
  config: any
) => void;

// Types for the validate function

export interface ListenFunctionReturn {
  id: string;
  transaction: GQLTransactionInterface;
  block: number;
}

export interface ValidateFunctionReturn {
  valid: boolean;
  id: string;
}

export type ValidateFunction = (
  listener: Observable<ListenFunctionReturn>,
  subscriber: Subscriber<ValidateFunctionReturn>,
  config: any
) => void;
