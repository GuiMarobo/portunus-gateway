import { countEmbeddingInputTokens } from '../chat/token-count';
import { float32LittleEndianBase64 } from './embedding-encoding';
import { embeddingVector } from './embedding-vector';

const LIST_OBJECT = 'list';
const EMBEDDING_OBJECT = 'embedding';

export type EncodingFormat = 'float' | 'base64';

export interface EmbeddingListRequest {
  readonly model: string;
  readonly inputs: readonly string[];
  readonly dimensions: number;
  readonly encodingFormat: EncodingFormat;
}

export interface Embedding {
  readonly object: string;
  readonly index: number;
  readonly embedding: readonly number[] | string;
}

export interface EmbeddingList {
  readonly object: string;
  readonly data: readonly Embedding[];
  readonly model: string;
  readonly usage: { readonly prompt_tokens: number; readonly total_tokens: number };
}

export function createEmbeddingList({
  model,
  inputs,
  dimensions,
  encodingFormat,
}: EmbeddingListRequest): EmbeddingList {
  const promptTokens = countEmbeddingInputTokens(inputs);
  return {
    object: LIST_OBJECT,
    data: inputs.map((text, index) => ({
      object: EMBEDDING_OBJECT,
      index,
      embedding: encode(embeddingVector({ model, text, dimensions }), encodingFormat),
    })),
    model,
    usage: { prompt_tokens: promptTokens, total_tokens: promptTokens },
  };
}

function encode(vector: Float32Array, encodingFormat: EncodingFormat): readonly number[] | string {
  return encodingFormat === 'base64' ? float32LittleEndianBase64(vector) : Array.from(vector);
}
