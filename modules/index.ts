import { AnotherModule } from "./anotherModule";
import { FunnelModule } from "./funnelModule";
import { ModuleBase } from "./moduleBase";
import { ThirdModule } from "./thirdModule";

export const KNOWN_MODULES: ModuleBase[] = [
	new FunnelModule(),
	new AnotherModule(),
	new ThirdModule(),
];
