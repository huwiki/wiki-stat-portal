import { IconName } from "@blueprintjs/core";
import { NextPageContext } from "next";
import { withRouter } from "next/router";
import * as React from "react";
import { PageFrame } from "../../client/components/pageFrame";
import { NextBasePage } from "../../client/helpers/nextBasePage";
import { CommonPageProps } from "../../common/interfaces/commonPageProps";
import { IModuleParameter } from "../../modules/common/parameters/moduleParameter";
import { moduleManager } from "../../modules/moduleManager";
import { withCommonServerSideProps } from "../../server/helpers/serverSidePageHelpers";

interface ModuleParameterPageProps extends CommonPageProps {
	moduleFound: boolean;
	moduleId: string | null;
	moduleIcon: IconName | null;
	moduleParameters: IModuleParameter[] | null;
}

class ModulePage extends NextBasePage<ModuleParameterPageProps> {
	public render(): JSX.Element {
		if (!this.props.moduleFound) {
			return this.render404Page();
		}

		return <PageFrame
			icon={this.props.moduleIcon || "help"}
			title={this.t("common", `module.${this.props.moduleId}`)}
			router={this.props.router}
			i18nProvider={this.i18nProvider}>
			Ide jön a kontent
		</PageFrame>;
	}
}

export const getServerSideProps = async (ctx: NextPageContext) => {
	let { moduleId } = ctx.query;
	moduleId = moduleId || "";
	const matchingModule = moduleManager.getModuleById(Array.isArray(moduleId) ? moduleId[0] : moduleId);

	return await withCommonServerSideProps<ModuleParameterPageProps>(ctx, {
		moduleFound: !!matchingModule,
		moduleId: matchingModule?.identifier || null,
		moduleIcon: matchingModule?.icon || null,
		moduleParameters: matchingModule?.getParameters() || null,
	});
};

export default withRouter(ModulePage);
