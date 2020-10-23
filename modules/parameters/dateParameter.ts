import { IModuleParameter } from "./moduleParameter";

export interface DateParameter extends IModuleParameter {
	type: "date";
	name: string;
}
