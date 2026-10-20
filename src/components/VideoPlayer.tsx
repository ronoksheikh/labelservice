import { Center, Stack, Text } from '@mantine/core';
import { IconVideoOff } from '@tabler/icons-react';
import { videoEmbed } from '../../shared/site';

export function VideoPlayer({ url, title }: { url: string; title: string }) {
  const embed = videoEmbed(url);
  return (
    <div className="video-frame">
      {!embed ? (
        <Center pos="absolute" inset={0}>
          <Stack align="center" gap={6} c="gray.5"><IconVideoOff size={32} /><Text fz={14}>No video for this lesson</Text></Stack>
        </Center>
      ) : embed.kind === 'file' ? (
        <video key={embed.src} src={embed.src} controls playsInline controlsList="nodownload" preload="metadata" />
      ) : (
        <iframe key={embed.src} src={embed.src} title={title} allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin" />
      )}
    </div>
  );
}
