import { ActionIcon, CopyButton, Group, Tooltip } from '@mantine/core';
import { IconCheck, IconCopy, IconExternalLink } from '@tabler/icons-react';
import { shareUrl } from '../format';

export function LinkActions({ token }: { token: string }) {
  return (
    <Group gap={4} wrap="nowrap" onClick={(event) => event.stopPropagation()}>
      <CopyButton value={shareUrl(token)}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? 'Copied' : 'Copy print-shop link'}>
            <ActionIcon variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy} aria-label="Copy link">
              {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
      <Tooltip label="Open print-shop page">
        <ActionIcon variant="subtle" color="gray" component="a" href={shareUrl(token)} target="_blank" aria-label="Open link">
          <IconExternalLink size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
