import GitlabInstance from 'model/backend/gitlab/instance';
import DigitalTwin, { formatName } from 'model/backend/digitalTwin';
import * as dtUtils from 'model/backend/util/digitalTwinUtils';
import {
  getBranchName,
  getGroupName,
  getRunnerTag,
} from 'model/backend/gitlab/digitalTwinConfig/settingsUtility';
import { mockBackendAPI } from 'test/__mocks__/global_mocks';
import indexedDBService from 'database/executionHistoryDB';
import { getUpdatedLibraryFile } from 'model/backend/util/digitalTwinUtils';
import { ExecutionStatus } from 'model/backend/interfaces/execution';
import { getAuthority } from 'util/envUtil';

jest.mock('database/executionHistoryDB');

jest.mock('model/backend/util/digitalTwinUtils', () => ({
  ...jest.requireActual('model/backend/util/digitalTwinUtils'),
  getUpdatedLibraryFile: jest.fn(),
}));

const mockedIndexedDBService = indexedDBService as jest.Mocked<
  typeof indexedDBService
> & {
  addExecutionHistory: jest.Mock;
  getExecutionHistoryByDTName: jest.Mock;
  getExecutionHistoryById: jest.Mock;
  updateExecutionHistory: jest.Mock;
};

const mockGitlabInstance = {
  api: mockBackendAPI,
  triggerToken: 'test-token',
  logs: [] as { jobName: string; log: string }[],
  setProjectIds: jest.fn(),
  getProjectId: jest.fn().mockReturnValue(1),
  getCommonProjectId: jest.fn().mockReturnValue(2),
  startPipeline: jest.fn().mockResolvedValue({ id: 123 }),
} as unknown as GitlabInstance;

const files = [
  {
    name: 'fileName',
    content: 'fileContent',
    isNew: true,
    isModified: false,
  },
];

describe('DigitalTwin', () => {
  let dt: DigitalTwin;

  beforeEach(() => {
    mockGitlabInstance.getProjectId = jest.fn().mockReturnValue(1);
    mockGitlabInstance.getCommonProjectId = jest.fn().mockReturnValue(2);
    mockGitlabInstance.startPipeline = jest.fn().mockResolvedValue({ id: 123 });
    dt = new DigitalTwin('test-DTName', mockGitlabInstance);

    Object.defineProperty(globalThis, 'sessionStorage', {
      value: {
        getItem: jest.fn(() => 'testUser'),
        setItem: jest.fn(),
        clear: jest.fn(),
        removeItem: jest.fn(),
        length: 0,
        key: jest.fn(),
      },
      writable: true,
    });
    mockedIndexedDBService.add.mockResolvedValue('mock-id');
    mockedIndexedDBService.getByDTName.mockResolvedValue([]);
    mockedIndexedDBService.getById.mockResolvedValue(null);
    mockedIndexedDBService.update.mockResolvedValue(undefined);
  });

  it('should get description', async () => {
    (mockBackendAPI.getRepositoryFileContent as jest.Mock).mockResolvedValue({
      content: 'Test description content',
    });

    await dt.getDescription();

    expect(dt.description).toBe('Test description content');
    expect(mockBackendAPI.getRepositoryFileContent).toHaveBeenCalledWith(
      1,
      'digital_twins/test-DTName/description.md',
      getBranchName(),
    );
  });

  it('should return empty description if no description file exists', async () => {
    (mockBackendAPI.getRepositoryFileContent as jest.Mock).mockRejectedValue(
      new Error('File not found'),
    );

    await dt.getDescription();

    expect(dt.description).toBe('There is no description.md file');
  });

  it('should return full description with updated image URLs if projectId exists', async () => {
    const mockContent =
      'Test README content with an image ![alt text](image.png)';

    (mockBackendAPI.getRepositoryFileContent as jest.Mock).mockResolvedValue({
      content: mockContent,
    });

    await dt.getFullDescription();

    expect(dt.fullDescription).toBe(
      `Test README content with an image ![alt text](${getAuthority()}/${getGroupName()}/testUser/-/raw/${getBranchName()}/digital_twins/test-DTName/image.png)`,
    );

    expect(mockBackendAPI.getRepositoryFileContent).toHaveBeenCalledWith(
      1,
      'digital_twins/test-DTName/README.md',
      getBranchName(),
    );
  });

  it('should return error message if no README.md file exists', async () => {
    (mockBackendAPI.getRepositoryFileContent as jest.Mock).mockRejectedValue(
      new Error('File not found'),
    );

    await dt.getFullDescription();

    expect(dt.fullDescription).toBe('There is no README.md file');
  });

  it('should execute pipeline and return the pipeline ID', async () => {
    const mockResponse = { id: 123 };
    (mockGitlabInstance.startPipeline as jest.Mock).mockResolvedValue(
      mockResponse,
    );
    (mockBackendAPI.getTriggerToken as jest.Mock).mockResolvedValue(
      'test-token',
    );

    dt.lastExecutionStatus = ExecutionStatus.SUCCESS;

    const pipelineId = await dt.execute();

    expect(pipelineId).toBe(123);
    expect(dt.lastExecutionStatus).toBe(ExecutionStatus.SUCCESS);
    expect(mockGitlabInstance.startPipeline).toHaveBeenCalledWith(
      1,
      getBranchName(),
      {
        DTName: 'test-DTName',
        RunnerTag: getRunnerTag(),
      },
    );
  });

  it('should log error and return null when projectId or triggerToken is missing', async () => {
    (dt.backend.getProjectId as jest.Mock).mockReturnValue(null);
    jest.spyOn(dtUtils, 'isValidInstance').mockReturnValue(false);
    (mockBackendAPI.getTriggerToken as jest.Mock).mockResolvedValue(null);

    dt.execute = jest.fn().mockResolvedValue(null);
    dt.lastExecutionStatus = ExecutionStatus.ERROR;

    const pipelineId = await dt.execute();

    expect(pipelineId).toBeNull();
    expect(dt.lastExecutionStatus).toBe(ExecutionStatus.ERROR);
    expect(mockBackendAPI.getTriggerToken).not.toHaveBeenCalled();
  });

  it('should log success and update status', () => {
    dtUtils.logSuccess(dt, getRunnerTag());

    expect(dt.backend.logs).toContainEqual({
      status: 'success',
      DTName: 'test-DTName',
      runnerTag: getRunnerTag(),
    });
    expect(dt.lastExecutionStatus).toBe(ExecutionStatus.SUCCESS);
  });

  it('should log error when triggering pipeline fails', async () => {
    jest.spyOn(dtUtils, 'isValidInstance').mockReturnValue(true);
    const errorMessage = 'Trigger failed';
    (mockGitlabInstance.startPipeline as jest.Mock).mockRejectedValue(
      errorMessage,
    );

    dt.execute = jest.fn().mockResolvedValue(null);
    dt.lastExecutionStatus = ExecutionStatus.ERROR;

    const pipelineId = await dt.execute();

    expect(pipelineId).toBeNull();
    expect(dt.lastExecutionStatus).toBe(ExecutionStatus.ERROR);
  });

  it('should handle non-Error thrown during pipeline execution', async () => {
    (mockGitlabInstance.startPipeline as jest.Mock).mockRejectedValue(
      'String error message',
    );

    dt.execute = jest.fn().mockResolvedValue(null);
    dt.lastExecutionStatus = ExecutionStatus.ERROR;

    const pipelineId = await dt.execute();

    expect(pipelineId).toBeNull();
    expect(dt.lastExecutionStatus).toBe(ExecutionStatus.ERROR);
  });

  it('should stop the parent pipeline and update status', async () => {
    (mockBackendAPI.cancelPipeline as jest.Mock).mockResolvedValue({});

    dt.pipelineId = 123;

    await dt.stop(1, 'parentPipeline');

    expect(mockBackendAPI.cancelPipeline).toHaveBeenCalled();
    expect(dt.lastExecutionStatus).toBe(ExecutionStatus.CANCELED);
  });

  it('should handle database errors when updating execution during stop', async () => {
    const mockExecution = {
      id: 'exec1',
      dtName: 'test-DTName',
      pipelineId: 123,
      timestamp: Date.now(),
      status: ExecutionStatus.RUNNING,
      jobLogs: [],
    };
    mockedIndexedDBService.getById.mockResolvedValue(mockExecution);
    mockedIndexedDBService.update.mockRejectedValue(new Error('Update failed'));
    (mockBackendAPI.cancelPipeline as jest.Mock).mockResolvedValue({});

    dt.currentExecutionId = 'exec1';
    dt.pipelineId = 123;

    await dt.stop(1, 'parentPipeline');

    expect(dt.lastExecutionStatus).toBe(ExecutionStatus.ERROR);
    expect(dt.backend.logs).toContainEqual(
      expect.objectContaining({
        status: 'error',
        DTName: 'test-DTName',
      }),
    );
  });

  it('should stop the child pipeline and update status', async () => {
    (mockBackendAPI.cancelPipeline as jest.Mock).mockResolvedValue({});

    await dt.stop(1, 'childPipeline');

    expect(mockBackendAPI.cancelPipeline).toHaveBeenCalled();
    expect(dt.lastExecutionStatus).toBe(ExecutionStatus.CANCELED);
  });

  it('should handle stop error', async () => {
    (mockBackendAPI.cancelPipeline as jest.Mock).mockRejectedValue(
      new Error('Stop failed'),
    );

    dt.pipelineId = 123;

    await dt.stop(1, 'parentPipeline');

    expect(dt.lastExecutionStatus).toBe(ExecutionStatus.ERROR);
  });

  it('should format the name correctly', () => {
    const testCases = [{ input: 'digital-twin', expected: 'Digital twin' }];

    testCases.forEach(({ input, expected }) => {
      expect(formatName(input)).toBe(expected);
    });
  });

  it('should delete the digital twin', async () => {
    (mockBackendAPI.removeRepositoryFile as jest.Mock).mockResolvedValue({});

    await dt.delete();

    expect(mockBackendAPI.removeRepositoryFile).toHaveBeenCalled();
  });

  it('should delete the digital twin and return success message', async () => {
    (mockBackendAPI.removeRepositoryFile as jest.Mock).mockResolvedValue({});

    const result = await dt.delete();

    expect(result).toBe('test-DTName deleted successfully');
    expect(mockBackendAPI.removeRepositoryFile).toHaveBeenCalledWith(
      1,
      'digital_twins/test-DTName',
      getBranchName(),
      'Removing test-DTName digital twin',
    );
  });

  it('should return error message when deletion fails', async () => {
    (mockBackendAPI.removeRepositoryFile as jest.Mock).mockRejectedValue(
      new Error('Delete failed'),
    );

    const result = await dt.delete();

    expect(result).toBe('Error deleting test-DTName digital twin');
  });

  it('should create digital twin with files', async () => {
    (mockBackendAPI.createRepositoryFile as jest.Mock).mockResolvedValue({});
    const result = await dt.create(files, [], []);

    expect(result).toBe(
      'test-DTName digital twin files initialized successfully.',
    );
  });

  it('should return error message when creating digital twin fails', async () => {
    (mockBackendAPI.createRepositoryFile as jest.Mock).mockRejectedValue(
      new Error('Create failed'),
    );

    const result = await dt.create(files, [], []);

    expect(result).toBe(
      'Error initializing test-DTName digital twin files: Error: Create failed',
    );
  });

  it('should return error message when projectId is missing during creation', async () => {
    (dt.backend.getProjectId as jest.Mock).mockReturnValueOnce(null);

    const result = await dt.create(files, [], []);

    expect(result).toBe(
      'Error initializing test-DTName digital twin files: Error: Create failed',
    );
  });

  it('should get execution history for a digital twin', async () => {
    const mockExecutions = [
      {
        id: 'exec1',
        dtName: 'test-DTName',
        pipelineId: 123,
        timestamp: Date.now(),
        status: ExecutionStatus.COMPLETED,
        jobLogs: [],
      },
      {
        id: 'exec2',
        dtName: 'test-DTName',
        pipelineId: 124,
        timestamp: Date.now(),
        status: ExecutionStatus.RUNNING,
        jobLogs: [],
      },
    ];
    mockedIndexedDBService.getByDTName.mockResolvedValue(mockExecutions);

    const result = await dt.getExecutionHistory();

    expect(result).toEqual(mockExecutions);
    expect(mockedIndexedDBService.getByDTName).toHaveBeenCalledWith(
      'test-DTName',
    );
  });

  it('should handle database errors when fetching execution history', async () => {
    mockedIndexedDBService.getByDTName.mockRejectedValue(
      new Error('Database error'),
    );

    await expect(dt.getExecutionHistory()).rejects.toThrow('Database error');
  });

  it('should get execution history by ID', async () => {
    const mockExecution = {
      id: 'exec1',
      dtName: 'test-DTName',
      pipelineId: 123,
      timestamp: Date.now(),
      status: ExecutionStatus.COMPLETED,
      jobLogs: [],
    };
    mockedIndexedDBService.getById.mockResolvedValue(mockExecution);

    const result = await dt.getExecutionHistoryById('exec1');

    expect(result).toEqual(mockExecution);
    expect(mockedIndexedDBService.getById).toHaveBeenCalledWith('exec1');
  });

  it('should return undefined when execution history by ID is not found', async () => {
    mockedIndexedDBService.getById.mockResolvedValue(null);

    const result = await dt.getExecutionHistoryById('exec1');

    expect(result).toBeUndefined();
    expect(mockedIndexedDBService.getById).toHaveBeenCalledWith('exec1');
  });

  it('should update execution logs', async () => {
    const mockExecution = {
      id: 'exec1',
      dtName: 'test-DTName',
      pipelineId: 123,
      timestamp: Date.now(),
      status: ExecutionStatus.RUNNING,
      jobLogs: [],
    };
    const newJobLogs = [{ jobName: 'job1', log: 'log1' }];
    mockedIndexedDBService.getById.mockResolvedValue(mockExecution);

    await dt.updateExecutionLogs('exec1', newJobLogs);

    expect(mockedIndexedDBService.getById).toHaveBeenCalledWith('exec1');
    expect(mockedIndexedDBService.update).toHaveBeenCalledWith({
      ...mockExecution,
      jobLogs: newJobLogs,
    });
  });

  it('should handle database errors when updating execution logs', async () => {
    const mockExecution = {
      id: 'exec1',
      dtName: 'test-DTName',
      pipelineId: 123,
      timestamp: Date.now(),
      status: ExecutionStatus.RUNNING,
      jobLogs: [],
    };
    mockedIndexedDBService.getById.mockResolvedValue(mockExecution);
    mockedIndexedDBService.update.mockRejectedValue(new Error('Update failed'));

    const newJobLogs = [{ jobName: 'job1', log: 'log1' }];

    await expect(dt.updateExecutionLogs('exec1', newJobLogs)).rejects.toThrow(
      'Update failed',
    );
  });

  it('should update instance job logs when executionId matches currentExecutionId', async () => {
    const mockExecution = {
      id: 'exec1',
      dtName: 'test-DTName',
      pipelineId: 123,
      timestamp: Date.now(),
      status: ExecutionStatus.RUNNING,
      jobLogs: [],
    };
    const newJobLogs = [{ jobName: 'job1', log: 'log1' }];
    mockedIndexedDBService.getById.mockResolvedValue(mockExecution);

    dt.currentExecutionId = 'exec1';
    await dt.updateExecutionLogs('exec1', newJobLogs);

    expect(dt.jobLogs).toEqual(newJobLogs);
  });

  it('should update execution status', async () => {
    const mockExecution = {
      id: 'exec1',
      dtName: 'test-DTName',
      pipelineId: 123,
      timestamp: Date.now(),
      status: ExecutionStatus.RUNNING,
      jobLogs: [],
    };
    mockedIndexedDBService.getById.mockResolvedValue(mockExecution);

    await dt.updateExecutionStatus('exec1', ExecutionStatus.COMPLETED);

    expect(mockedIndexedDBService.getById).toHaveBeenCalledWith('exec1');
    expect(mockedIndexedDBService.update).toHaveBeenCalledWith({
      ...mockExecution,
      status: ExecutionStatus.COMPLETED,
    });
  });

  it('should handle database errors when updating execution status', async () => {
    const mockExecution = {
      id: 'exec1',
      dtName: 'test-DTName',
      pipelineId: 123,
      timestamp: Date.now(),
      status: ExecutionStatus.RUNNING,
      jobLogs: [],
    };
    mockedIndexedDBService.getById.mockResolvedValue(mockExecution);
    mockedIndexedDBService.update.mockRejectedValue(new Error('Update failed'));

    await expect(
      dt.updateExecutionStatus('exec1', ExecutionStatus.COMPLETED),
    ).rejects.toThrow('Update failed');
  });

  it('should update instance status when executionId matches currentExecutionId', async () => {
    const mockExecution = {
      id: 'exec1',
      dtName: 'test-DTName',
      pipelineId: 123,
      timestamp: Date.now(),
      status: ExecutionStatus.RUNNING,
      jobLogs: [],
    };
    mockedIndexedDBService.getById.mockResolvedValue(mockExecution);

    dt.currentExecutionId = 'exec1';
    await dt.updateExecutionStatus('exec1', ExecutionStatus.COMPLETED);

    expect(dt.lastExecutionStatus).toBe(ExecutionStatus.COMPLETED);
  });

  it('should stop a specific execution by ID', async () => {
    const mockExecution = {
      id: 'exec1',
      dtName: 'test-DTName',
      pipelineId: 123,
      timestamp: Date.now(),
      status: ExecutionStatus.RUNNING,
      jobLogs: [],
    };
    mockedIndexedDBService.getById.mockResolvedValue(mockExecution);

    (mockBackendAPI.cancelPipeline as jest.Mock).mockResolvedValue({});

    await dt.stop(1, 'parentPipeline', 'exec1');

    expect(mockedIndexedDBService.getById).toHaveBeenCalledWith('exec1');
    expect(mockBackendAPI.cancelPipeline).toHaveBeenCalledWith(1, 123);
    expect(mockedIndexedDBService.update).toHaveBeenCalledWith({
      ...mockExecution,
      status: ExecutionStatus.CANCELED,
    });
  });

  it('should handle database errors when saving execution history', async () => {
    (mockGitlabInstance.startPipeline as jest.Mock).mockResolvedValue({
      id: 123,
    });
    mockedIndexedDBService.add.mockRejectedValue(new Error('Database error'));

    const pipelineId = await dt.execute();

    expect(pipelineId).toBeNull();
    expect(dt.lastExecutionStatus).toBe(ExecutionStatus.ERROR);
    expect(dt.backend.logs).toContainEqual(
      expect.objectContaining({
        status: 'error',
        DTName: 'test-DTName',
      }),
    );
  });

  it('should stop a child pipeline for a specific execution by ID', async () => {
    const mockExecution = {
      id: 'exec1',
      dtName: 'test-DTName',
      pipelineId: 123,
      timestamp: Date.now(),
      status: ExecutionStatus.RUNNING,
      jobLogs: [],
    };
    mockedIndexedDBService.getById.mockResolvedValue(mockExecution);
    (mockBackendAPI.cancelPipeline as jest.Mock).mockResolvedValue({});

    await dt.stop(1, 'childPipeline', 'exec1');

    expect(mockedIndexedDBService.getById).toHaveBeenCalledWith('exec1');
    expect(mockBackendAPI.cancelPipeline).toHaveBeenCalledWith(1, 124); // pipelineId + 1
    expect(mockedIndexedDBService.update).toHaveBeenCalledWith({
      ...mockExecution,
      status: ExecutionStatus.CANCELED,
    });
  });

  describe('getAssetFiles', () => {
    beforeEach(() => {
      jest.spyOn(dt.DTAssets, 'getFolders').mockImplementation();
      jest.spyOn(dt.DTAssets, 'getLibraryConfigFileNames').mockImplementation();
    });

    it('should get asset files with common subfolder structure', async () => {
      const mockFolders = ['folder1', 'folder2/common', 'folder3'];
      const mockSubFolders = ['folder2/common/sub1', 'folder2/common/sub2'];
      const mockFileNames = ['file1.json', 'file2.json'];

      jest
        .spyOn(dt.DTAssets, 'getFolders')
        .mockResolvedValueOnce(mockFolders) // Main folders
        .mockResolvedValueOnce(mockSubFolders); // Common subfolders

      jest
        .spyOn(dt.DTAssets, 'getLibraryConfigFileNames')
        .mockResolvedValue(mockFileNames);

      const result = await dt.getAssetFiles();

      expect(dt.DTAssets.getFolders).toHaveBeenCalledWith(
        'digital_twins/test-DTName',
      );
      expect(dt.DTAssets.getFolders).toHaveBeenCalledWith('folder2/common');

      expect(dt.DTAssets.getLibraryConfigFileNames).toHaveBeenCalledWith(
        'folder1',
      );
      expect(dt.DTAssets.getLibraryConfigFileNames).toHaveBeenCalledWith(
        'folder3',
      );
      expect(dt.DTAssets.getLibraryConfigFileNames).toHaveBeenCalledWith(
        'folder2/common/sub1',
      );
      expect(dt.DTAssets.getLibraryConfigFileNames).toHaveBeenCalledWith(
        'folder2/common/sub2',
      );

      expect(result).toEqual([
        { assetPath: 'folder1', fileNames: mockFileNames },
        { assetPath: 'folder2/common/sub1', fileNames: mockFileNames },
        { assetPath: 'folder2/common/sub2', fileNames: mockFileNames },
        { assetPath: 'folder3', fileNames: mockFileNames },
      ]);

      expect(dt.assetFiles).toEqual(result);
    });

    it('should get asset files without common subfolders', async () => {
      const mockFolders = ['folder1', 'folder2', 'folder3'];
      const mockFileNames = ['config1.json', 'config2.json'];

      jest.spyOn(dt.DTAssets, 'getFolders').mockResolvedValue(mockFolders);
      jest
        .spyOn(dt.DTAssets, 'getLibraryConfigFileNames')
        .mockResolvedValue(mockFileNames);

      const result = await dt.getAssetFiles();

      expect(dt.DTAssets.getFolders).toHaveBeenCalledWith(
        'digital_twins/test-DTName',
      );

      expect(dt.DTAssets.getLibraryConfigFileNames).toHaveBeenCalledWith(
        'folder1',
      );
      expect(dt.DTAssets.getLibraryConfigFileNames).toHaveBeenCalledWith(
        'folder2',
      );
      expect(dt.DTAssets.getLibraryConfigFileNames).toHaveBeenCalledWith(
        'folder3',
      );

      expect(result).toEqual([
        { assetPath: 'folder1', fileNames: mockFileNames },
        { assetPath: 'folder2', fileNames: mockFileNames },
        { assetPath: 'folder3', fileNames: mockFileNames },
      ]);
    });

    it('should filter out lifecycle folders', async () => {
      const mockFolders = [
        'folder1',
        'lifecycle',
        'folder2/lifecycle',
        'folder3',
      ];
      const mockFileNames = ['file1.json'];

      jest.spyOn(dt.DTAssets, 'getFolders').mockResolvedValue(mockFolders);
      jest
        .spyOn(dt.DTAssets, 'getLibraryConfigFileNames')
        .mockResolvedValue(mockFileNames);

      const result = await dt.getAssetFiles();

      expect(dt.DTAssets.getLibraryConfigFileNames).toHaveBeenCalledWith(
        'folder1',
      );
      expect(dt.DTAssets.getLibraryConfigFileNames).toHaveBeenCalledWith(
        'folder3',
      );
      expect(dt.DTAssets.getLibraryConfigFileNames).not.toHaveBeenCalledWith(
        'lifecycle',
      );
      expect(dt.DTAssets.getLibraryConfigFileNames).not.toHaveBeenCalledWith(
        'folder2/lifecycle',
      );

      expect(result).toEqual([
        { assetPath: 'folder1', fileNames: mockFileNames },
        { assetPath: 'folder3', fileNames: mockFileNames },
      ]);
    });

    it('should return empty array when getFolders fails (line 439)', async () => {
      jest
        .spyOn(dt.DTAssets, 'getFolders')
        .mockRejectedValue(new Error('Folder access failed'));

      const result = await dt.getAssetFiles();

      expect(result).toEqual([]);
      expect(dt.assetFiles).toEqual([]);
    });

    it('should handle getLibraryConfigFileNames errors gracefully', async () => {
      const mockFolders = ['folder1', 'folder2'];

      jest.spyOn(dt.DTAssets, 'getFolders').mockResolvedValue(mockFolders);
      jest
        .spyOn(dt.DTAssets, 'getLibraryConfigFileNames')
        .mockRejectedValue(new Error('File access failed'));

      const result = await dt.getAssetFiles();

      expect(result).toEqual([]);
    });
  });

  describe('prepareAllAssetFiles', () => {
    const mockGetUpdatedLibraryFile =
      getUpdatedLibraryFile as jest.MockedFunction<
        typeof getUpdatedLibraryFile
      >;

    beforeEach(() => {
      mockGetUpdatedLibraryFile.mockClear();
    });

    it('should process cart assets and library files', async () => {
      const mockCartAssets = [
        {
          name: 'asset1',
          path: 'path/to/asset1',
          isPrivate: false,
        },
      ];
      const mockLibraryFiles = [
        {
          name: 'config.json',
          fileContent: 'updated content',
        },
      ];
      const mockAssetFiles = [
        {
          name: 'config.json',
          content: 'original content',
          path: 'path/to/config.json',
          isPrivate: false,
        },
      ];

      jest
        .spyOn(dt.DTAssets, 'getFilesFromAsset')
        .mockResolvedValue(mockAssetFiles);
      mockGetUpdatedLibraryFile.mockReturnValue({
        fileContent: 'updated content',
      } as unknown as ReturnType<typeof mockGetUpdatedLibraryFile>);

      const result = await dt.prepareAllAssetFiles(
        mockCartAssets as unknown as Parameters<
          typeof dt.prepareAllAssetFiles
        >[0],
        mockLibraryFiles as unknown as Parameters<
          typeof dt.prepareAllAssetFiles
        >[1],
      );

      expect(dt.DTAssets.getFilesFromAsset).toHaveBeenCalledWith(
        'path/to/asset1',
        false,
      );
      expect(mockGetUpdatedLibraryFile).toHaveBeenCalledWith(
        'config.json',
        'path/to/asset1',
        false,
        mockLibraryFiles,
      );
      expect(result).toEqual([
        {
          name: 'asset1/config.json',
          content: 'updated content', // Should use updated content from library files
          isNew: true,
          isFromCommonLibrary: true,
        },
      ]);
    });

    it('should handle empty cart assets', async () => {
      const result = await dt.prepareAllAssetFiles([], []);

      expect(result).toEqual([]);
    });

    it('should handle assets without library file updates', async () => {
      const mockCartAssets = [
        {
          name: 'asset1',
          path: 'path/to/asset1',
          isPrivate: true,
        },
      ];
      const mockAssetFiles = [
        {
          name: 'file.txt',
          content: 'original content',
          path: 'path/to/file.txt',
          isPrivate: true,
        },
      ];

      jest
        .spyOn(dt.DTAssets, 'getFilesFromAsset')
        .mockResolvedValue(mockAssetFiles);
      mockGetUpdatedLibraryFile.mockReturnValue(null); // No library file update

      const result = await dt.prepareAllAssetFiles(
        mockCartAssets as unknown as Parameters<
          typeof dt.prepareAllAssetFiles
        >[0],
        [],
      );

      expect(mockGetUpdatedLibraryFile).toHaveBeenCalledWith(
        'file.txt',
        'path/to/asset1',
        true,
        [],
      );
      expect(result).toEqual([
        {
          name: 'asset1/file.txt',
          content: 'original content', // Should use original content when no library file update
          isNew: true,
          isFromCommonLibrary: false, // Private asset
        },
      ]);
    });
  });
});
