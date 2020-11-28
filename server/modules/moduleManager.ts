import fs from "fs";
import path from "path";
import { Logger } from "winston";
import { getResourcesBasePath } from "../helpers/i18nServer";
import { createWikiStatLogger } from "../loggingHelper";
import { ModuleBase } from "./common/moduleBase";
import { ModuleJsonConfiguration } from "./common/moduleJsonConfiguration";
import { UserPyramidsModule } from "./userPyramidsModule/userPyramidsModule";

class ModuleManager {
	private allModules: ModuleBase[];
	private logger: Logger;

	public knownModules: ModuleBase[] = [];
	private moduleDictionary: { [index: string]: ModuleBase } = {};

	constructor() {
		this.logger = createWikiStatLogger("modules");
		this.initializeModules();
	}

	public * getModules(): Generator<ModuleBase> {
		for (const module of this.knownModules) {
			yield module;
		}
	}

	public getModuleById<T extends ModuleBase>(identifier: string): T | null {
		if (this.moduleDictionary[identifier])
			return this.moduleDictionary[identifier] as T;

		return null;
	}

	public initializeModules(): void {
		this.allModules = [
			new UserPyramidsModule(this.logger),
			//new AnotherModule(this.logger),
			//new ThirdModule(this.logger)
		];

		for (const module of this.allModules) {
			const moduleConfigPath = path.join(getResourcesBasePath(), "configuration", "modules", module.identifier, "configuration.json");

			const fileData = fs.readFileSync(moduleConfigPath, { encoding: "utf-8" });

			const moduleConfig: ModuleJsonConfiguration = JSON.parse(fileData);
			if (moduleConfig) {
				module.initialize(moduleConfig);
				if (!module.isInitialized) {
					return;
				}

				this.knownModules.push(module);
				this.moduleDictionary[module.identifier] = module;
			}
		}
	}
}

const moduleManager = new ModuleManager();


export {
	moduleManager
};
