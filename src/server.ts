import { app } from "./index.js";
import { startAdmitter } from "./queue.js";
import { config } from "./config.js";
import { startOutboxWorker } from "./outbox.js";

startAdmitter();
startOutboxWorker();
app.listen(config.port, () => console.log(`TicketRush on :${config.port}`));
