import { createApp } from './app.js'
import { TagModel } from './models/odbc/tags.js'

createApp({ tagModel: TagModel })