import { IconName } from "@blueprintjs/core";
import { isArray } from "util";
import { ModuleJsonConfiguration } from "./moduleJsonConfiguration";
import { IModuleParameter } from "./parameters/moduleParameter";

interface ModuleInitializationSettings {
	identifier: string;
	icon: IconName;
}

export abstract class ModuleBase {
	private _isInitialized = false;
	private _availableAt: string[] = [];

	public get isInitialized(): boolean {
		return this._isInitialized;
	}

	public get identifier(): string {
		return this.settings.identifier;
	}
	public get icon(): IconName {
		return this.settings.icon;
	}
	public get availableAt(): string[] {
		return [...this._availableAt];
	}

	constructor(private settings: ModuleInitializationSettings) {
	}

	public initialize(configuration: ModuleJsonConfiguration): void {
		if (configuration.supportedWikis && isArray(configuration.supportedWikis)) {
			this._availableAt = [...configuration.supportedWikis];
		}
		// TODO: what to do

		if (this.initializeModuleSpecificSettingsFromConfiguration(configuration)) {
			this._isInitialized = true;
		}
	}

	protected abstract initializeModuleSpecificSettingsFromConfiguration(configuration: ModuleJsonConfiguration): boolean;
	abstract getParameters(): IModuleParameter[];
}
