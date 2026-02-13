import { useEffect } from 'react';
import { Paper, Typography } from '@mui/material';
import LinkButtons from 'components/LinkButtons';
import Layout from 'page/Layout';

import styled from '@emotion/styled';
import { useWorkbenchLinkValues, useServicesUrl } from 'util/envUtil';
import { useDispatch } from 'react-redux';
import { fetchWorkspaceServices } from 'store/workspaceServices.slice';
import type { AppDispatch } from 'store/store';

const Container = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-grow: 1;
`;

function WorkBenchContent() {
  const dispatch = useDispatch<AppDispatch>();
  const servicesUrl = useServicesUrl();

  useEffect(() => {
    dispatch(fetchWorkspaceServices(servicesUrl));
  }, [dispatch, servicesUrl]);

  const linkValues = useWorkbenchLinkValues();
  return (
    <Layout sx={{ display: 'flex' }}>
      <Paper
        sx={{
          p: 2,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        <Typography variant="h4">Workbench Tools</Typography>
        <Container>
          <LinkButtons buttons={linkValues} size={6} marginRight={40} />
        </Container>
      </Paper>
    </Layout>
  );
}

export default function WorkBench() {
  return <WorkBenchContent />;
}
