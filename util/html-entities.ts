import { decode } from 'npm:html-entities';

const decodeHtml = (input: string) => decode(input);

export default decodeHtml;