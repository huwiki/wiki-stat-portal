import { IconName } from "@blueprintjs/core";
import { NextPageContext } from "next";
import { withRouter } from "next/router";
import * as React from "react";
import { PageFrame } from "../../client/components/pageFrame";
import { NextBasePage } from "../../client/helpers/nextBasePage";
import { CommonPageProps } from "../../common/interfaces/commonPageProps";
import { withCommonServerSideProps } from "../../server/helpers/serverSidePageHelpers";
import { GetServerSidePropsResult } from "../../server/interfaces/getServerSidePropsResult";
import { IModuleParameter } from "../../server/modules/common/parameters/moduleParameter";
import { moduleManager } from "../../server/modules/moduleManager";

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
			title={this.t(`module.${this.props.moduleId}`)}
			router={this.props.router}
			i18nProvider={this.i18nProvider}>
			Ide jön a kontent
		</PageFrame>;
	}
}

export const getServerSideProps = async (ctx: NextPageContext): Promise<GetServerSidePropsResult<ModuleParameterPageProps>> => {
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
