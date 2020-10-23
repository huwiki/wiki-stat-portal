import { Cookie } from "next-cookie";

declare module "next" {
	interface NextPageContext {
		cookie?: Cookie;
	}
}
