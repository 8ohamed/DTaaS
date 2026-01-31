import {
  LibraryConfigFile,
  FileState,
  FileType,
} from 'model/backend/interfaces/sharedInterfaces';
import { Dispatch, SetStateAction } from 'react';

export const isFileModifiable = (fileName: string) =>
  !['README.md', 'description.md', '.gitlab-ci.yml'].includes(fileName);
export const isFileDeletable = (fileName: string) =>
  !['.gitlab-ci.yml'].includes(fileName);

export const getExtension = (filename: string): string => {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()! : '';
};

export const validateFiles = (
  files: FileState[],
  libraryFiles: LibraryConfigFile[],
  setErrorMessage: Dispatch<SetStateAction<string>>,
): boolean => {
  const emptyFiles = files
    .filter((file) => file.isNew && file.content === '')
    .map((file) => file.name);

  const emptyLibraryFiles = libraryFiles.filter(
    (file) => file.isNew && file.isModified && file.fileContent === '',
  );

  if (emptyFiles.length > 0 || emptyLibraryFiles.length > 0) {
    setErrorMessage(
      `The following files have empty content: ${
        emptyFiles.length > 0 ? emptyFiles.join(', ') : ''
      }${emptyFiles.length > 0 && emptyLibraryFiles.length > 0 ? ', ' : ''}${
        emptyLibraryFiles.length > 0
          ? emptyLibraryFiles
              .map((file) => `${file.fileName} (${file.assetPath})`)
              .join(', ')
          : ''
      }.\n Edit them in order to create the new digital twin.`,
    );
    return true;
  }
  return false;
};

export const getFileTypeFromExtension = (fileName: string): FileType => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension === 'md') return FileType.DESCRIPTION;
  if (extension === 'json' || extension === 'yaml' || extension === 'yml')
    return FileType.CONFIGURATION;
  return FileType.LIFECYCLE;
};

export const getFilteredFileNames = (type: FileType, files: FileState[]) =>
  files
    .filter(
      (file) => file.isNew && getFileTypeFromExtension(file.name) === type,
    )
    .map((file) => file.name);

export const updateFileState = (
  fileName: string,
  fileContent: string,
  setFileName: Dispatch<SetStateAction<string>>,
  setFileContent: Dispatch<SetStateAction<string>>,
  setFileType: Dispatch<SetStateAction<string>>,
  setFilePrivacy: Dispatch<SetStateAction<string>>,
  isPrivate?: boolean,
) => {
  setFileName(fileName);
  setFileContent(fileContent);
  setFileType(fileName.split('.').pop()!);
  setFilePrivacy(isPrivate === undefined || isPrivate ? 'private' : 'common');
};
