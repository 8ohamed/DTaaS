import { Dispatch, SetStateAction } from 'react';
import { Button } from '@mui/material';
import { useSelector } from 'react-redux';
import { selectAssetByPathAndPrivacy } from 'model/store/assets.slice';
import { DescriptionProvider } from 'model/backend/interfaces/sharedInterfaces';
import LibraryAsset from 'model/backend/libraryAsset';
import { createDigitalTwinFromData } from 'model/backend/util/digitalTwinAdapter';
import { selectDigitalTwinByName } from 'store/selectors/digitalTwin.selectors';

interface DialogButtonProps {
  assetName: string;
  assetPrivacy: boolean;
  setShowDetails: Dispatch<SetStateAction<boolean>>;
  library?: boolean;
  assetPath?: string;
}

// Helper to show description dialog for any asset type
const showAssetDescription = async (
  asset: DescriptionProvider,
  setShowDetails: Dispatch<SetStateAction<boolean>>,
) => {
  await asset.getFullDescription();
  setShowDetails(true);
};

// Handle library asset details display
const handleLibraryAssetClick = async (
  asset: LibraryAsset,
  setShowDetails: Dispatch<SetStateAction<boolean>>,
) => {
  await showAssetDescription(asset, setShowDetails);
};

// Handle digital twin details display
const handleDigitalTwinClick = async (
  asset: any,
  assetName: string,
  setShowDetails: Dispatch<SetStateAction<boolean>>,
) => {
  if (!('DTName' in asset)) return;
  
  const digitalTwinInstance = await createDigitalTwinFromData(asset, assetName);
  await showAssetDescription(digitalTwinInstance, setShowDetails);
};

function DetailsButton({
  assetName,
  assetPrivacy,
  setShowDetails,
  library,
  assetPath,
}: DialogButtonProps) {
  const digitalTwin = useSelector(selectDigitalTwinByName(assetName));
  const libraryAsset = useSelector(
    selectAssetByPathAndPrivacy(assetPath || '', assetPrivacy),
  );

  const asset = library ? libraryAsset : digitalTwin;

  const handleClick = async () => {
    if (!asset) return;

    if (library) {
      await handleLibraryAssetClick(asset as LibraryAsset, setShowDetails);
    } else {
      await handleDigitalTwinClick(asset, assetName, setShowDetails);
    }
  };

  return (
    <Button
      variant="contained"
      size="small"
      color="primary"
      onClick={handleClick}
    >
      Details
    </Button>
  );
}

export default DetailsButton;
