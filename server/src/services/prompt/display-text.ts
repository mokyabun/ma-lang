import type { RegexScript } from '@malang/shared'

import { processRegexText } from './regex-runtime'
import { renderTemplate, type TemplateContext } from './template-engine'

/** Display text for one message after Lua editDisplay: editdisplay regex, then CBS. */
export async function renderDisplayText(
    text: string,
    scripts: RegexScript[],
    templateContext: TemplateContext,
): Promise<string> {
    const regex = await processRegexText({
        text,
        phase: 'editdisplay',
        scripts,
        templateContext,
    })
    return renderTemplate(regex.text, { ...templateContext, assetRenderMode: 'display' }).text
}
