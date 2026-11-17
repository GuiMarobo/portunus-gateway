import { defineProject, mergeConfig } from 'vitest/config';
import shared from '../../vitest.shared.mts';

export default mergeConfig(shared, defineProject({ test: { name: 'common' } }));
