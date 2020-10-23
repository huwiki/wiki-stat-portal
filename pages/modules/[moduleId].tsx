import { IconName } from "@blueprintjs/core";
import { NextPageContext } from "next";
import { Cookie, withCookie } from "next-cookie";
import { withRouter } from "next/router";
import * as React from "react";
import { NextBasePage } from "../../helpers/nextBasePage";
import { KNOWN_MODULES } from "../../modules";
import { PageFrame } from "../../modules/pageFrame";
import { IModuleParameter } from "../../modules/parameters/moduleParameter";
import { CommonPageProps } from "../commonPageProps";

interface ModuleParameterPageProps extends CommonPageProps {
	moduleFound?: boolean;
	moduleId?: string;
	moduleIcon?: IconName;
	moduleParameters?: IModuleParameter[];
	cookie?: Cookie;
}

class ModulePage extends NextBasePage<ModuleParameterPageProps> {
	public render(): JSX.Element {
		return <PageFrame icon={this.props.moduleIcon} title={this.t("common", `module.${this.props.moduleId}`)}>
			Ide jön a kontent
		</PageFrame>;
	}

	public static getInitialProps = async (ctx: NextPageContext): Promise<Partial<ModuleParameterPageProps>> => {
		const { moduleId } = ctx.query;
		const matchingModule = KNOWN_MODULES.find(x => x.identifier === moduleId);

		return NextBasePage.withCommonInitialProps<ModuleParameterPageProps>(ctx, {
			moduleFound: !!matchingModule,
			moduleId: matchingModule?.identifier,
			moduleIcon: matchingModule?.icon,
			moduleParameters: matchingModule?.getParameters(),
		});
	}
}

export default withRouter(withCookie(ModulePage));
