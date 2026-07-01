import { Router } from 'express'
import { TagController } from '../controllers/tags.js'


export const createTagRouter = ({ tagModel }) => {

    const tagsRouter = Router()
    const tagController = new TagController({ tagModel })

    // GET /tags/interval?tagnames=TAG1,TAG2&start=...&end=...&interval_seconds=60
    tagsRouter.get('/interval', tagController.getTagsByInterval)

    // GET /tags?tagnames=TAG1,TAG2&start=2026-01-01 00:00:00&end=2026-01-31 23:59:59
    tagsRouter.get('/', tagController.getByTags)

    // GET /tags/:tagname/browse
    tagsRouter.get('/:tagname/browse', tagController.browseTag)

    // GET /tags/:tagname?start=2026-01-01 00:00:00&end=2026-01-31 23:59:59
    tagsRouter.get('/:tagname', tagController.getByTag)

    return tagsRouter
}

