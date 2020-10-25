import { AnotherModule } from "./anotherModule/anotherModule";
import { ModuleBase } from "./common/moduleBase";
import { FunnelModule } from "./funnelModule/funnelModule";
import { ThirdModule } from "./thirdModule/thirdModule";

export const KNOWN_MODULES: ModuleBase[] = [
	new FunnelModule(),
	new AnotherModule(),
	new ThirdModule(),
];
