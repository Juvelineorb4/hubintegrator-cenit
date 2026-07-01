export class TagController {

    constructor({ tagModel }) {
        this.tagModel = tagModel
    }

    /**
     * GET /tags?tagnames=TAG1,TAG2&start=2026-01-01 00:00:00&end=2026-01-31 23:59:59
     */
    getByTags = async (req, res) => {
        const { tagnames, start, end } = req.query
        console.log(req.query)
        if (!tagnames || !start || !end) {
            return res.status(400).json({ error: 'Se requieren los parámetros: tagnames, start, end' })
        }

        const tagnameList = tagnames.split(',')

        try {
            const data = await this.tagModel.getByTags(tagnameList, start, end)
            res.json(data)
        } catch (error) {
            res.status(500).json({ error: error.message })
        }
    }

    /**
     * GET /tags/:tagname/browse
     */
    browseTag = async (req, res) => {
        const { tagname } = req.params

        try {
            const data = await this.tagModel.browseTag(tagname)
            res.json(data)
        } catch (error) {
            res.status(500).json({ error: error.message })
        }
    }

    /**
     * GET /tags/:tagname?start=2026-01-01 00:00:00&end=2026-01-31 23:59:59
     */
    getByTag = async (req, res) => {
        const { tagname } = req.params
        const { start, end } = req.query
        //console.log(req.params)
        if (!start || !end) {
            return res.status(400).json({ error: 'Se requieren los parámetros: start, end' })
        }

        try {
            const data = await this.tagModel.getByTag(tagname, start, end)
            res.json(data)
        } catch (error) {
            res.status(500).json({ error: error.message })
        }
    }

    /**
     * GET /tags/interval?tagnames=TAG1,TAG2&start=...&end=...&interval_seconds=60
     */
    getTagsByInterval = async (req, res) => {
        const { tagnames, start, end, interval_seconds } = req.query

        if (!tagnames || !start || !end || !interval_seconds) {
            return res.status(400).json({ error: 'Se requieren los parámetros: tagnames, start, end, interval_seconds' })
        }

        const parsedInterval = Number(interval_seconds)
        if (!Number.isFinite(parsedInterval) || parsedInterval <= 0) {
            return res.status(400).json({ error: 'interval_seconds debe ser un número entero positivo' })
        }

        const tagnameList = tagnames.split(',')

        try {
            const data = await this.tagModel.getTagsByInterval(tagnameList, start, end, parsedInterval)
            res.json(data)
        } catch (error) {
            res.status(500).json({ error: error.message })
        }
    }

}

