import { describe, it, expect } from 'vitest';
import { parseWorkspaceYamlContent } from '../src/utils/index.js';

describe('parseWorkspaceYamlContent', () => {
  it('parses basic workspace directories', () => {
    const content = `packages:
  - apps/*
  - packages/*
`;
    expect(parseWorkspaceYamlContent(content)).toEqual(['apps', 'packages']);
  });

  it('handles ./ prefix and /**/* suffix', () => {
    const content = `packages:
  - ./packages/**/*
  - ./apps/**/*
  - ./examples/**/*
`;
    expect(parseWorkspaceYamlContent(content)).toEqual(['packages', 'apps', 'examples']);
  });

  it('handles quoted entries', () => {
    const content = `packages:
  - "apps/*"
  - 'packages/*'
`;
    expect(parseWorkspaceYamlContent(content)).toEqual(['apps', 'packages']);
  });

  it('filters out hidden directories', () => {
    const content = `packages:
  - .config/*
  - apps/*
  - .hidden/*
`;
    expect(parseWorkspaceYamlContent(content)).toEqual(['apps']);
  });

  it('stops parsing at next top-level key', () => {
    const content = `packages:
  - apps/*
  - packages/*

onlyBuiltDependencies:
  - esbuild
`;
    expect(parseWorkspaceYamlContent(content)).toEqual(['apps', 'packages']);
  });

  it('returns empty array for invalid content', () => {
    expect(parseWorkspaceYamlContent('')).toEqual([]);
    expect(parseWorkspaceYamlContent('invalid: yaml')).toEqual([]);
  });
});
