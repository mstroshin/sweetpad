import * as vscode from "vscode";
import type { BuildTreeItem } from "../build/tree";
import { askXcodeWorkspacePath } from "../build/utils";
import { showConfigurationPicker, showYesNoQuestion } from "../common/askers";
import { getBuildConfigurations } from "../common/cli/scripts";
import type { ExtensionContext } from "../common/commands";
import { updateWorkspaceConfig } from "../common/config";
import { showInputBox, showQuickPick } from "../common/quick-pick";
import type { ParsedTestPlan } from "./testplan";
import { askSchemeForTesting, askTestingTarget } from "./utils";

export async function selectTestingTargetCommand(context: ExtensionContext): Promise<void> {
  context.updateProgressStatus("Searching for workspace");
  const xcworkspace = await askXcodeWorkspacePath(context);

  context.updateProgressStatus("Selecting testing target");
  await askTestingTarget(context, {
    title: "Select default testing target",
    xcworkspace: xcworkspace,
    force: true,
  });
}

export async function buildForTestingCommand(context: ExtensionContext): Promise<void> {
  context.updateProgressStatus("Building for testing");
  return await context.testingManager.buildForTestingCommand(context);
}

export async function testWithoutBuildingCommand(
  context: ExtensionContext,
  ...items: vscode.TestItem[]
): Promise<void> {
  context.updateProgressStatus("Running tests without building");
  const request = new vscode.TestRunRequest(items, [], undefined, undefined);
  const tokenSource = new vscode.CancellationTokenSource();
  await context.testingManager.runTestsWithoutBuilding(request, tokenSource.token);
}

export async function selectXcodeSchemeForTestingCommand(context: ExtensionContext, item?: BuildTreeItem) {
  context.updateProgressStatus("Selecting scheme for testing");

  if (item) {
    item.provider.buildManager.setDefaultSchemeForTesting(item.scheme);
    return;
  }

  const xcworkspace = await askXcodeWorkspacePath(context);
  await askSchemeForTesting(context, {
    title: "Select scheme to set as default",
    xcworkspace: xcworkspace,
    ignoreCache: true,
  });
}

/**
 * Ask user to select configuration for testing
 */
export async function selectConfigurationForTestingCommand(context: ExtensionContext): Promise<void> {
  context.updateProgressStatus("Searching for workspace");
  const xcworkspace = await askXcodeWorkspacePath(context);

  context.updateProgressStatus("Searching for configurations");
  const configurations = await getBuildConfigurations({
    xcworkspace: xcworkspace,
  });

  let selected: string | undefined;
  if (configurations.length === 0) {
    selected = await showInputBox({
      title: "No configurations found. Please enter configuration name manually",
    });
  } else {
    selected = await showConfigurationPicker(configurations);
  }

  if (!selected) {
    vscode.window.showErrorMessage("Configuration was not selected");
    return;
  }

  const saveAnswer = await showYesNoQuestion({
    title: "Do you want to update configuration in the workspace settings (.vscode/settings.json)?",
  });
  if (saveAnswer) {
    await updateWorkspaceConfig("testing.configuration", selected);
    context.buildManager.setDefaultConfigurationForTesting(undefined);
  } else {
    context.buildManager.setDefaultConfigurationForTesting(selected);
  }
}

/**
 * Command to select a test plan for testing
 */
export async function selectTestPlanCommand(context: ExtensionContext): Promise<void> {
  context.updateProgressStatus("Discovering test plans");

  // Discover available test plans
  const testPlans = await context.testingManager.discoverTestPlans();

  if (testPlans.length === 0) {
    vscode.window.showInformationMessage(
      "No test plans found in the workspace. Test plans are .xctestplan files typically located in your Xcode project.",
    );
    return;
  }

  // Get currently selected test plan
  const currentPlan = context.testingManager.getSelectedTestPlan();

  // Build quick pick items
  interface TestPlanPickItem {
    label: string;
    description?: string;
    detail?: string;
    context: ParsedTestPlan | null;
  }

  const items: TestPlanPickItem[] = [
    {
      label: "$(close) None (use all tests)",
      description: currentPlan === undefined ? "(current)" : undefined,
      detail: "Run tests without a specific test plan",
      context: null,
    },
    ...testPlans.map((plan) => ({
      label: `$(beaker) ${plan.name}`,
      description: currentPlan?.path === plan.path ? "(current)" : undefined,
      detail: `${plan.plan.testTargets.length} test target(s) - ${plan.path}`,
      context: plan,
    })),
  ];

  const selected = await showQuickPick<ParsedTestPlan | null>({
    title: "Select a test plan",
    items: items,
  });

  // Update selected test plan
  context.testingManager.setSelectedTestPlan(selected.context ?? undefined);

  if (selected.context) {
    vscode.window.showInformationMessage(`Selected test plan: ${selected.context.name}`);
  } else {
    vscode.window.showInformationMessage("Test plan selection cleared");
  }
}

/**
 * Command to refresh/rediscover test plans
 */
export async function refreshTestPlansCommand(context: ExtensionContext): Promise<void> {
  context.updateProgressStatus("Refreshing test plans");

  const testPlans = await context.testingManager.discoverTestPlans();

  vscode.window.showInformationMessage(`Found ${testPlans.length} test plan(s)`);
}

/**
 * Command to refresh/rediscover all tests in the workspace
 */
export async function refreshTestsCommand(context: ExtensionContext): Promise<void> {
  context.updateProgressStatus("Discovering tests");

  await context.testingManager.refreshAllTests();

  const testCount = context.testingManager.controller.items.size;
  vscode.window.showInformationMessage(`Discovered ${testCount} test class(es)`);
}
