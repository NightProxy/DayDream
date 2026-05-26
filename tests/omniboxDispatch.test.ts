import { describe, it, expect } from 'vitest';
import { dispatch } from '@browser/omnibox/dispatch';

describe('Omnibox dispatch', () => {
	it('empty input -> { mode: "closed" }', () => {
		expect(dispatch('')).toEqual({ mode: 'closed' });
	});

	it('whitespace-only -> closed', () => {
		expect(dispatch('   ')).toEqual({ mode: 'closed' });
	});

	it('"hello" -> default mode with payload "hello"', () => {
		expect(dispatch('hello')).toEqual({ mode: 'default', payload: 'hello' });
	});

	it('">cmd" -> command mode with payload "cmd"', () => {
		expect(dispatch('>cmd')).toEqual({ mode: 'command', payload: 'cmd' });
	});

	it('">" alone -> command mode with empty payload', () => {
		expect(dispatch('>')).toEqual({ mode: 'command', payload: '' });
	});

	it('"@yt cats" -> engine mode with payload "yt cats"', () => {
		expect(dispatch('@yt cats')).toEqual({ mode: 'engine', payload: 'yt cats' });
	});

	it('"@" alone -> engine mode with empty payload', () => {
		expect(dispatch('@')).toEqual({ mode: 'engine', payload: '' });
	});

	it('"!yt cats" -> bang mode with payload "yt cats"', () => {
		expect(dispatch('!yt cats')).toEqual({ mode: 'bang', payload: 'yt cats' });
	});

	it('"?question" -> ai mode with payload "question"', () => {
		expect(dispatch('?question')).toEqual({ mode: 'ai', payload: 'question' });
	});

	it('"?" alone -> ai mode with empty payload', () => {
		expect(dispatch('?')).toEqual({ mode: 'ai', payload: '' });
	});

	it('leading whitespace honored, mode picked from first non-whitespace', () => {
		expect(dispatch('   >cmd')).toEqual({ mode: 'command', payload: 'cmd' });
		expect(dispatch('   @yt')).toEqual({ mode: 'engine', payload: 'yt' });
	});

	it('URL-prefixed input goes to default mode regardless of mode chars mid-string', () => {
		expect(dispatch('https://example.com/?q=>foo')).toEqual({
			mode: 'default',
			payload: 'https://example.com/?q=>foo',
		});
		expect(dispatch('http://example.com/@yt')).toEqual({
			mode: 'default',
			payload: 'http://example.com/@yt',
		});
		expect(dispatch('data:text/plain,!hello')).toEqual({
			mode: 'default',
			payload: 'data:text/plain,!hello',
		});
		expect(dispatch('javascript:?')).toEqual({
			mode: 'default',
			payload: 'javascript:?',
		});
	});
});
