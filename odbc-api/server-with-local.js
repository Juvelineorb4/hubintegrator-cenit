import { createApp } from './app.js'
import { TagModel } from './models/local-file-system/tags.js'

createApp({ tagModel: TagModel })