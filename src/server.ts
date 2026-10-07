import { app } from "./index.js";
import { startAdmitter } from "./queue.js";
import { config } from "./config.js";

startAdmitter();
app.listen(config.port, () => console.log(`TicketRush on :${config.port}`));
