import express, { json } from 'express' // require -> commonJS
import { createTagRouter } from './routes/tags.js'
import { corsMiddleware } from './middlewares/cors.js'


export const createApp = ({ tagModel }) => {
  const app = express()
  app.use(json())
  app.use(corsMiddleware())
  app.disable('x-powered-by')


  app.use('/tags', createTagRouter({ tagModel }))

  const PORT = process.env.PORT ?? 1234

  app.listen(PORT, () => {
    console.log(`server listening on port http://localhost:${PORT}`)
  })
}


