import { UserRequirements } from "../commonConfiguration";

export interface TopListConfigurationFile {
	use: string;
	topLists?: TopListConfiguration[];
}

export type WikiTopListConfigurations =
	{
		wiki: string;
		valid: false;
		validationError: string;
	} | {
		wiki: string;
		valid: true;
		topLists: TopListConfiguration[];
	};

export type TopListConfiguration =
	NonLocalizedTopListConfiguration
	| LocalizedTopListConfiguration;

export interface NonLocalizedTopListConfiguration {
	id: string;
	name: string;
	itemCount: number;
	userRequirements: UserRequirements;
	isTimeless: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isNonLocalizedTopListConfiguration(obj: any): obj is NonLocalizedTopListConfiguration {
	return typeof obj.name === "string";
}


export interface LocalizedTopListConfiguration {
	id: string;
	i18nKey: string;
	itemCount: number;
	isTimeless: boolean;
	userRequirements: UserRequirements;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isLocalizedTopListConfiguration(obj: any): obj is LocalizedTopListConfiguration {
	return typeof obj.i18nKey === "string";
}
