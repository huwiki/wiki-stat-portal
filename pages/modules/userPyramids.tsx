import { IconName } from "@blueprintjs/core";
import { NextPageContext } from "next";
import { withRouter } from "next/router";
import * as React from "react";
import { PageFrame } from "../../client/components/pageFrame";
import { NextBasePage } from "../../client/helpers/nextBasePage";
import { CommonPageProps } from "../../common/interfaces/commonPageProps";
import { PyramidVisualization } from "../../components/pyramidVisualization";
import { withCommonServerSideProps } from "../../server/helpers/serverSidePageHelpers";
import { GetServerSidePropsResult } from "../../server/interfaces/getServerSidePropsResult";
import { IModuleParameter } from "../../server/modules/common/parameters/moduleParameter";
import { moduleManager } from "../../server/modules/moduleManager";

interface UserPyramidModulePageProps extends CommonPageProps {
	moduleFound: boolean;
	moduleId: string | null;
	moduleIcon: IconName | null;
	moduleParameters: IModuleParameter[] | null;
}

class UserPyramidModulePage extends NextBasePage<UserPyramidModulePageProps> {
	public render(): JSX.Element {
		if (!this.props.moduleFound) {
			return this.render404Page();
		}

		return <PageFrame
			icon="horizontal-bar-chart-desc"
			title={this.t("module.userPyramids")}
			router={this.props.router}
			i18nProvider={this.i18nProvider}>

			<PyramidVisualization
				title="I. szerkesztői piramis"
				seriesDescriptions={["2020. 10. 01."]}
				groups={[{
					description: "anon szerkesztők",
					seriesValues: [{ value: 734, commonWithPreviousGroup: 0 }]
				}, {
					description: "1+ regisztrált szerkesztők",
					seriesValues: [{ value: 324, commonWithPreviousGroup: 40 }]
				}, {
					description: "5+ regisztrált szerkesztők",
					seriesValues: [{ value: 134, commonWithPreviousGroup: 134 }]
				}, {
					description: "100+ regisztrált szerkesztők",
					seriesValues: [{ value: 12, commonWithPreviousGroup: 1 }]
				}]}
				translatorFunction={this.t}
			/>

			<PyramidVisualization
				title="I. szerkesztői piramis"
				seriesDescriptions={["2020. 10. 01."]}
				groups={[{
					description: "anon szerkesztők",
					seriesValues: [{ value: 734, commonWithPreviousGroup: 0 }]
				}, {
					description: "1+ regisztrált szerkesztők",
					seriesValues: [{ value: 1111, commonWithPreviousGroup: 40 }]
				}, {
					description: "5+ regisztrált szerkesztők",
					seriesValues: [{ value: 134, commonWithPreviousGroup: 134 }]
				}, {
					description: "100+ regisztrált szerkesztők",
					seriesValues: [{ value: 12, commonWithPreviousGroup: 1 }]
				}]}
				translatorFunction={this.t}
			/>

			<PyramidVisualization
				title="I. szerkesztői piramis"
				seriesDescriptions={[
					"2020. 09. 01.",
					"2020. 10. 01."
				]}
				groups={[{
					description: "anon szerkesztők",
					seriesValues: [
						{ value: 734, commonWithPreviousGroup: 0 },
						{ value: 525, commonWithPreviousGroup: 0 }
					]
				}, {
					description: "1+ regisztrált szerkesztők",
					seriesValues: [
						{ value: 324, commonWithPreviousGroup: 140 },
						{ value: 235, commonWithPreviousGroup: 222 }
					]
				}, {
					description: "5+ regisztrált szerkesztők",
					seriesValues: [
						{ value: 134, commonWithPreviousGroup: 100 },
						{ value: 111, commonWithPreviousGroup: 23 }
					]
				}, {
					description: "100+ regisztrált szerkesztők",
					seriesValues: [
						{ value: 12, commonWithPreviousGroup: 10 },
						{ value: 53, commonWithPreviousGroup: 20 }
					]
				}]}
				translatorFunction={this.t}
			/>

		</PageFrame>;
	}
}

export const getServerSideProps = async (ctx: NextPageContext): Promise<GetServerSidePropsResult<UserPyramidModulePageProps>> => {
	const userPyramidsModule = moduleManager.getModuleById("userPyramids");

	return await withCommonServerSideProps<UserPyramidModulePageProps>(ctx, {
		moduleFound: !!userPyramidsModule,
		moduleId: userPyramidsModule?.identifier,
		moduleIcon: userPyramidsModule?.icon,
		moduleParameters: [],
	});
};

export default withRouter(UserPyramidModulePage);
