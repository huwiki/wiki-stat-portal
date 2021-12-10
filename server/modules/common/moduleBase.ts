import { IconName } from "@blueprintjs/core";
import { isArray } from "util";
import { Logger } from "winston";
import { ModuleIdType } from "../../../common/modules/moduleIdentifiers";
import { ModuleJsonConfiguration } from "./moduleJsonConfiguration";

interface ModuleInitializationSettings {
	logger: Logger;
	identifier: ModuleIdType;
	icon: IconName;
}

export abstract class ModuleBase {
	protected logger: Logger;
	private _isInitialized = false;
	private _availableAt: string[] = [];

	public get isInitialized(): boolean {
		return this._isInitialized;
	}

	public get identifier(): ModuleIdType {
		return this.settings.identifier;
	}
	public get icon(): IconName {
		return this.settings.icon;
	}
	public get availableAt(): string[] {
		return [...this._availableAt];
	}

	constructor(private settings: ModuleInitializationSettings) {
		this.logger = settings.logger;
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
}
