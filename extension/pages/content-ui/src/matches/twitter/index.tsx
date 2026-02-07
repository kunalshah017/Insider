import inlineCss from '../../../dist/twitter/index.css?inline';
import { initAppWithShadow } from '@extension/shared';
import App from '@src/matches/twitter/App';

initAppWithShadow({ id: 'insider-polymarket', app: <App />, inlineCss });
