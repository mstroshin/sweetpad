import path from "node:path";
import * as vscode from "vscode";
import { readJsonFile } from "../common/files";
import { commonLogger } from "../common/logger";

/**
 * Represents a test target reference in the test plan
 */
export interface TestPlanTargetReference {
  containerPath: string; // e.g., "container:MyApp.xcodeproj"
  identifier: string; // unique identifier
  name: string; // target name, e.g., "MyAppTests"
}

/**
 * Represents a test target configuration in the test plan
 */
export interface TestPlanTarget {
  target: TestPlanTargetReference;
  /**
   * List of test identifiers to include (if present, only these tests run)
   * Format: ["TestClass", "TestClass/testMethod"]
   */
  selectedTests?: string[];
  /**
   * List of test identifiers to skip
   * Format: ["TestClass", "TestClass/testMethod"]
   */
  skippedTests?: string[];
  /**
   * Whether to parallelize test execution
   */
  parallelizable?: boolean;
  /**
   * Whether to randomize execution order
   */
  randomExecutionOrdering?: boolean;
}

/**
 * Test plan configuration options
 */
export interface TestPlanConfigurationOptions {
  language?: string;
  region?: string;
  testExecutionOrdering?: "lexical" | "random";
  addressSanitizer?: { enabled: boolean };
  threadSanitizer?: { enabled: boolean };
  undefinedBehaviorSanitizer?: { enabled: boolean };
  locationScenario?: {
    identifier: string;
    referenceType: string;
  };
}

/**
 * Test plan configuration (can have multiple configurations in one plan)
 */
export interface TestPlanConfiguration {
  name: string;
  options: TestPlanConfigurationOptions;
}

/**
 * Default options for the test plan
 */
export interface TestPlanDefaultOptions {
  codeCoverage?: boolean;
  testTimeoutsEnabled?: boolean;
  defaultTestExecutionTimeAllowance?: number;
  maximumTestExecutionTimeAllowance?: number;
  testRepetitionMode?: "none" | "untilFailure" | "retryOnFailure" | "fixedIterations";
  maximumTestRepetitions?: number;
}

/**
 * The complete xctestplan file structure
 */
export interface XCTestPlan {
  configurations: TestPlanConfiguration[];
  defaultOptions: TestPlanDefaultOptions;
  testTargets: TestPlanTarget[];
  version: number;
}

/**
 * Represents a parsed test plan with its file path
 */
export interface ParsedTestPlan {
  name: string;
  path: string;
  plan: XCTestPlan;
}

/**
 * Parse an xctestplan JSON file
 */
export async function parseTestPlan(testPlanPath: string): Promise<ParsedTestPlan> {
  const plan = await readJsonFile<XCTestPlan>(testPlanPath);
  const name = path.basename(testPlanPath, ".xctestplan");

  return {
    name,
    path: testPlanPath,
    plan,
  };
}

/**
 * Find all test plans in the workspace directory and its subdirectories
 */
export async function findTestPlans(workspacePath: string): Promise<string[]> {
  try {
    // Use VS Code's workspace.findFiles which supports glob patterns
    const pattern = new vscode.RelativePattern(workspacePath, "**/*.xctestplan");
    const excludePattern = "{**/node_modules/**,**/DerivedData/**,**/build/**,**/.build/**,**/Pods/**}";

    const files = await vscode.workspace.findFiles(pattern, excludePattern);
    return files.map((file) => file.fsPath);
  } catch (error) {
    commonLogger.error("Error finding test plans", { error });
    return [];
  }
}

/**
 * Find test plans associated with a specific xcworkspace or xcodeproj
 */
export async function findTestPlansForWorkspace(xcworkspacePath: string): Promise<string[]> {
  // Look for test plans in the parent directory of the workspace
  // Test plans are usually located at the same level as the workspace or in shared schemes
  const workspaceDir = path.dirname(xcworkspacePath);

  return findTestPlans(workspaceDir);
}

/**
 * Load and parse all test plans in a directory
 */
export async function loadTestPlans(workspacePath: string): Promise<ParsedTestPlan[]> {
  const testPlanPaths = await findTestPlans(workspacePath);
  const parsedPlans: ParsedTestPlan[] = [];

  for (const planPath of testPlanPaths) {
    try {
      const parsed = await parseTestPlan(planPath);
      parsedPlans.push(parsed);
    } catch (error) {
      commonLogger.error("Error parsing test plan", {
        error,
        path: planPath,
      });
    }
  }

  return parsedPlans;
}

/**
 * Check if a test identifier matches the selected/skipped tests in a test target
 *
 * @param testId - The test identifier, e.g., "MyTestClass" or "MyTestClass.testMethod"
 * @param target - The test plan target configuration
 * @returns true if the test should be included, false if it should be skipped
 */
export function isTestIncludedInTarget(testId: string, target: TestPlanTarget): boolean {
  // Convert dot notation to slash notation for comparison
  // e.g., "MyTestClass.testMethod" -> "MyTestClass/testMethod"
  const normalizedId = testId.replace(".", "/");
  const className = normalizedId.split("/")[0];

  // If selectedTests is specified, only those tests should run
  if (target.selectedTests && target.selectedTests.length > 0) {
    return target.selectedTests.some((selected) => {
      // Check for exact match or parent match (class level selection)
      return normalizedId === selected || normalizedId.startsWith(`${selected}/`) || selected === className;
    });
  }

  // If skippedTests is specified, all tests except those should run
  if (target.skippedTests && target.skippedTests.length > 0) {
    return !target.skippedTests.some((skipped) => {
      return normalizedId === skipped || normalizedId.startsWith(`${skipped}/`) || skipped === className;
    });
  }

  // By default, include all tests
  return true;
}

/**
 * Get the target name from a test plan target
 */
export function getTargetName(target: TestPlanTarget): string {
  return target.target.name;
}

/**
 * Get all target names from a test plan
 */
export function getTestPlanTargetNames(plan: XCTestPlan): string[] {
  return plan.testTargets.map((t) => t.target.name);
}

/**
 * Find a specific target configuration in a test plan by name
 */
export function findTargetInTestPlan(plan: XCTestPlan, targetName: string): TestPlanTarget | undefined {
  return plan.testTargets.find((t) => t.target.name === targetName);
}
