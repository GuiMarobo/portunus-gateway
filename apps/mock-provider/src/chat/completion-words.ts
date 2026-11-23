import { mulberry32 } from './seeded-random';

const SEED_OFFSET = 0;

export const COMPLETION_VOCABULARY: readonly string[] = [
  'alpha',
  'amber',
  'anchor',
  'arrow',
  'autumn',
  'beacon',
  'birch',
  'bridge',
  'brook',
  'canyon',
  'cedar',
  'cinder',
  'cloud',
  'comet',
  'coral',
  'crane',
  'dawn',
  'delta',
  'dune',
  'ember',
  'falcon',
  'fern',
  'field',
  'flint',
  'forest',
  'frost',
  'garden',
  'glacier',
  'harbor',
  'hazel',
  'horizon',
  'island',
  'ivory',
  'jasper',
  'lagoon',
  'lantern',
  'maple',
  'meadow',
  'mesa',
  'mist',
  'harvest',
  'nectar',
  'oak',
  'ocean',
  'orbit',
  'pebble',
  'pine',
  'prairie',
  'quartz',
  'raven',
  'reef',
  'ridge',
  'river',
  'saffron',
  'sierra',
  'summit',
  'thistle',
  'timber',
  'tundra',
  'valley',
  'violet',
  'willow',
  'winter',
  'zephyr',
];

export function generateCompletionWords(seed: Buffer, count: number): string[] {
  const random = mulberry32(seed.readUInt32BE(SEED_OFFSET));
  return Array.from({ length: count }, () => pickWord(random()));
}

function pickWord(randomValue: number): string {
  const word = COMPLETION_VOCABULARY[Math.floor(randomValue * COMPLETION_VOCABULARY.length)];
  if (word === undefined) {
    throw new RangeError('random value must be in [0, 1)');
  }
  return word;
}
