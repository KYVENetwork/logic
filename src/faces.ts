import { Subscriber } from "rxjs";

// Types for the upload function

export interface UploadFunctionReturn {
  data: any;
  tags?: { name: string; value: string }[];
}

export type UploadFunction = (
  subscriber: Subscriber<UploadFunctionReturn>
) => void;

// Types for the validate function

export interface ValidateFunctionReturn {
  valid: boolean;
  id: string;
}

export type ValidateFunction = (
  subscriber: Subscriber<ValidateFunctionReturn>
) => void;
