import fs from "fs";
import path from "path";
import { getResourcesBasePath } from "../helpers/i18nServer";
import { AnotherModule } from "./anotherModule/anotherModule";
import { ModuleBase } from "./common/moduleBase";
import { ModuleJsonConfiguration } from "./common/moduleJsonConfiguration";
import { FunnelModule } from "./funnelModule/funnelModule";
import { ThirdModule } from "./thirdModule/thirdModule";

class ModuleManager {
	private allModules: ModuleBase[];

	public knownModules: ModuleBase[] = [];
	private moduleDictionary: { [index: string]: ModuleBase } = {};

	constructor() {
		this.initializeModules();
	}

	public * getModules(): Generator<ModuleBase> {
		for (const module of this.knownModules) {
			yield module;
		}
	}

	public getModuleById(identifier: string): ModuleBase | null {
		if (this.moduleDictionary[identifier])
			return this.moduleDictionary[identifier];

		return null;
	}

	public initializeModules(): void {
		this.allModules = [
			new FunnelModule(),
			new AnotherModule(),
			new ThirdModule()
		];

		for (const module of this.allModules) {
			const moduleConfigPath = path.join(getResourcesBasePath(), "modules", module.identifier, "configuration.json");

			fs.readFile(moduleConfigPath, { encoding: "utf-8" }, (err, data) => {
				if (err) {
					// TODO: log
					return;
				}

				const moduleConfig: ModuleJsonConfiguration = JSON.parse(data);
				if (moduleConfig) {
					module.initialize(moduleConfig);
					if (!module.isInitialized)
						return;

					this.knownModules.push(module);
					this.moduleDictionary[module.identifier] = module;
				}
			});
		}
	}
}

export const moduleManager = new ModuleManager();
