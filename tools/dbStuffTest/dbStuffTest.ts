import { moduleManager } from "../../server/modules/moduleManager";

const mm = moduleManager;
for (const module of mm.getModules()) {
	console.log(module.identifier);
}
