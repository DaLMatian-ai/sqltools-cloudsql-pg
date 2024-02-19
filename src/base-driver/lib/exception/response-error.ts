import { ResponseError } from 'vscode-languageserver';
import { INotifyErrorData } from './../../../types';

export class NotifyResponseError<T = INotifyErrorData> extends ResponseError<T> {
  constructor(code: number, message: string, data: T) {
    super(code, message, data);
  }
}

export default NotifyResponseError;