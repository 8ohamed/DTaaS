import { DTExecutionResult } from 'model/backend/gitlab/types/executionHistory';
import { DigitalTwinData } from 'model/backend/state/digitalTwin.slice';
import { createDigitalTwinFromData } from 'model/backend/util/digitalTwinAdapter';
import { ExecutionStatus } from 'model/backend/interfaces/execution';
import { IExecutionHistoryStorage } from 'model/backend/interfaces/sharedInterfaces';

class ExecutionStatusService {
  static async checkRunningExecutions(
    runningExecutions: DTExecutionResult[],
    digitalTwinsData: { [key: string]: DigitalTwinData },
    executionStorage: IExecutionHistoryStorage,
  ): Promise<DTExecutionResult[]> {
    if (runningExecutions.length === 0) {
      return [];
    }
    const { fetchJobLogs } =
      await import('model/backend/gitlab/execution/logFetching');
    const { mapGitlabStatusToExecutionStatus } =
      await import('model/backend/gitlab/execution/statusChecking');
    const updatedExecutions: DTExecutionResult[] = [];
    await Promise.all(
      runningExecutions.map(async (execution) => {
        try {
          const digitalTwinData = digitalTwinsData[execution.dtName];
          if (digitalTwinData?.gitlabProjectId == null) {
            return;
          }
          const digitalTwin = await createDigitalTwinFromData(
            digitalTwinData,
            execution.dtName,
          );
          const parentPipelineStatus =
            await digitalTwin.backend.getPipelineStatus(
              digitalTwin.backend.getProjectId(),
              execution.pipelineId,
            );
          if (parentPipelineStatus === 'failed') {
            const updatedExecution = {
              ...execution,
              status: ExecutionStatus.FAILED,
            };
            await executionStorage.update(updatedExecution);
            updatedExecutions.push(updatedExecution);
            return;
          }
          if (parentPipelineStatus !== 'success') {
            return;
          }
          const childPipelineId = execution.pipelineId + 1;
          try {
            const childPipelineStatus =
              await digitalTwin.backend.getPipelineStatus(
                digitalTwin.backend.getProjectId(),
                childPipelineId,
              );
            if (
              childPipelineStatus === 'success' ||
              childPipelineStatus === 'failed'
            ) {
              const newStatus =
                mapGitlabStatusToExecutionStatus(childPipelineStatus);
              const jobLogs = await fetchJobLogs(
                digitalTwin.backend,
                childPipelineId,
              );
              const updatedExecution = {
                ...execution,
                status: newStatus,
                jobLogs,
              };
              await executionStorage.update(updatedExecution);
              updatedExecutions.push(updatedExecution);
            }
          } catch {
            // Child pipeline might not exist yet or other error - silently ignore
          }
        } catch {
          // Silently ignore errors for individual executions
        }
      }),
    );
    return updatedExecutions;
  }
}
export default ExecutionStatusService;
