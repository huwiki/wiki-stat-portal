import { IconName } from "@blueprintjs/core";
import { NextPageContext } from "next";
import { withRouter } from "next/router";
import * as React from "react";
import { PageFrame } from "../../client/components/pageFrame";
import { NextBasePage } from "../../client/helpers/nextBasePage";
import { CommonPageProps } from "../../common/interfaces/commonPageProps";
import { KNOWN_MODULES } from "../../modules";
import { IModuleParameter } from "../../modules/common/parameters/moduleParameter";
import { withCommonServerSideProps } from "../../server/helpers/serverSidePageHelpers";

interface ModuleParameterPageProps extends CommonPageProps {
	moduleFound?: boolean;
	moduleId?: string;
	moduleIcon?: IconName;
	moduleParameters?: IModuleParameter[];
}

class ModulePage extends NextBasePage<ModuleParameterPageProps> {
	public render(): JSX.Element {
		return <PageFrame
			icon={this.props.moduleIcon}
			title={this.t("common", `module.${this.props.moduleId}`)}
			router={this.props.router}
			i18nProvider={this.i18nProvider}>
			Ide jön a kontent
		</PageFrame>;
	}

}

export const getServerSideProps = async (ctx: NextPageContext) => {
	const { moduleId } = ctx.query;
	const matchingModule = KNOWN_MODULES.find(x => x.identifier === moduleId);

	return await withCommonServerSideProps<ModuleParameterPageProps>(ctx, {
		moduleFound: !!matchingModule,
		moduleId: matchingModule?.identifier,
		moduleIcon: matchingModule?.icon,
		moduleParameters: matchingModule?.getParameters(),
	});
};

export default withRouter(ModulePage);
