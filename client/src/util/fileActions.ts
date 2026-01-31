import { addOrUpdateFile, renameFile } from 'model/store/file.slice';
import {
  FileState,
  FileType,
} from 'model/backend/interfaces/sharedInterfaces';
import { Dispatch, SetStateAction } from 'react';
import { useDispatch } from 'react-redux';
import { getExtension } from 'util/fileUtils';

export const addDefaultFiles = (
  defaultFilesNames: { name: string; type: FileType }[],
  files: FileState[],
  dispatch: ReturnType<typeof useDispatch>,
) => {
  defaultFilesNames.forEach((file) => {
    if (!files.some((existingFile) => existingFile.name === file.name)) {
      dispatch(
        addOrUpdateFile({
          name: file.name,
          content: '',
          isNew: true,
          isModified: false,
          type: file.type,
        }),
      );
    }
  });
};

export const handleChangeFileName = (
  files: FileState[],
  modifiedFileName: string,
  fileName: string,
  setFileName: Dispatch<SetStateAction<string>>,
  setFileType: Dispatch<SetStateAction<string>>,
  setErrorChangeMessage: Dispatch<SetStateAction<string>>,
  setOpenChangeFileNameDialog: Dispatch<SetStateAction<boolean>>,
  dispatch: ReturnType<typeof useDispatch>,
) => {
  const fileExists = files.some(
    (fileStore: { name: string }) => fileStore.name === modifiedFileName,
  );

  if (fileExists) {
    setErrorChangeMessage('A file with this name already exists.');
    return;
  }

  if (modifiedFileName === '') {
    setErrorChangeMessage("File name can't be empty.");
    return;
  }

  setErrorChangeMessage('');
  dispatch(renameFile({ oldName: fileName, newName: modifiedFileName }));
  setFileName(modifiedFileName);

  const extension = getExtension(modifiedFileName);
  setFileType(extension);

  setOpenChangeFileNameDialog(false);
};
