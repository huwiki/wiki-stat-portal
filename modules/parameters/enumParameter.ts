import { IModuleParameter } from "./moduleParameter";

export interface EnumParameter extends IModuleParameter {
	type: "enum";
	name: string;
	valueKind: string;
	availableValues: string[];
}
