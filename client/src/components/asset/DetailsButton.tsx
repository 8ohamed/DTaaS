import { Dispatch, SetStateAction } from 'react';
import { Button } from '@mui/material';
import { useSelector } from 'react-redux';
import { selectAssetByPathAndPrivacy } from 'model/store/assets.slice';
import LibraryAsset from 'model/backend/libraryAsset';
import { createDigitalTwinFromData } from 'model/backend/util/digitalTwinAdapter';
import { selectDigitalTwinByName } from 'store/selectors/digitalTwin.selectors';
import { getAuthority } from 'util/envUtil';
import { DigitalTwinData } from 'model/backend/state/digitalTwin.slice';

interface DialogButtonProps {
  readonly assetName: string;
  readonly assetPrivacy: boolean;
  readonly setShowDetails: Dispatch<SetStateAction<boolean>>;
  readonly library?: boolean;
  readonly assetPath?: string;
}

// Handle library asset details display
const handleLibraryAssetClick = async (
  asset: LibraryAsset,
  setShowDetails: Dispatch<SetStateAction<boolean>>,
) => {
  await asset.getFullDescription(getAuthority());
  setShowDetails(true);
};

// Handle digital twin details display
const handleDigitalTwinClick = async (
  digitalTwinData: DigitalTwinData,
  assetName: string,
  setShowDetails: Dispatch<SetStateAction<boolean>>,
) => {
  if (!('DTName' in digitalTwinData)) return;

  const digitalTwinInstance = await createDigitalTwinFromData(
    digitalTwinData,
    assetName,
  );
  await digitalTwinInstance.getFullDescription();
  setShowDetails(true);
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
      await handleDigitalTwinClick(
        asset as DigitalTwinData,
        assetName,
        setShowDetails,
      );
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
