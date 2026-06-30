
import { register } from './index';
import { DDXError } from '../types';

const NS = (n: string) => async () => {
	throw new DDXError('not_supported', `bookmarks.${n} unavailable in v1`);
};

register('bookmarks.get', async () => []);
register('bookmarks.getChildren', async () => []);
register('bookmarks.getRecent', async () => []);
register('bookmarks.getTree', async () => []);
register('bookmarks.getSubTree', async () => []);
register('bookmarks.search', async () => []);
register('bookmarks.create', NS('create'));
register('bookmarks.move', NS('move'));
register('bookmarks.update', NS('update'));
register('bookmarks.remove', NS('remove'));
register('bookmarks.removeTree', NS('removeTree'));
