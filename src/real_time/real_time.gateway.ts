import { Logger } from '@nestjs/common';
import {
	ConnectedSocket,
	MessageBody,
	OnGatewayConnection,
	OnGatewayDisconnect,
	OnGatewayInit,
	SubscribeMessage,
	WebSocketGateway,
	WebSocketServer,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { ResponseEventDto } from './dto/response-event.dto';

@WebSocketGateway({
	namespace: '/responses',
	cors: {
		origin: '*',
		methods: ['GET', 'POST'],
		credentials: true,
	},
})
export class RealTimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer()
	server!: Namespace;

	private readonly logger = new Logger(RealTimeGateway.name);

	afterInit() {
		this.logger.log('WebSocket gateway inicializado en namespace /responses');
	}

	handleConnection(client: Socket) {
		this.logger.log(`Cliente conectado: ${client.id}`);
	}

	handleDisconnect(client: Socket) {
		this.logger.log(`Cliente desconectado: ${client.id}`);
	}

	@SubscribeMessage('join-case')
	handleJoinCase(@ConnectedSocket() client: Socket, @MessageBody() payload: { caseId: string }) {
		const room = `case:${payload.caseId}`;
		void client.join(room);
		this.logger.log(`${client.id} se unió a la sala ${room}`);
		client.emit('joined', { room });
	}

	/**
	 * Permite al cliente abandonar la sala de un caso.
	 */
	@SubscribeMessage('leave-case')
	handleLeaveCase(@ConnectedSocket() client: Socket, @MessageBody() payload: { caseId: string }) {
		const room = `case:${payload.caseId}`;
		void client.leave(room);
		this.logger.log(`${client.id} abandonó la sala ${room}`);
		client.emit('left', { room });
	}

	broadcastResponse(dto: ResponseEventDto) {
		const room = `case:${dto.caseId}`;
		const event = 'response:new';
		const payload = {
			...dto,
			timestamp: dto.timestamp ?? new Date().toISOString(),
		};

		this.server.to(room).emit(event, payload);
		this.logger.log(`Broadcast [${event}] → sala ${room}`);
	}
}
