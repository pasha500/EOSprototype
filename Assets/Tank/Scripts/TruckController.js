﻿#pragma strict

var suspensionRange : float = 0.1;
var suspensionDamper : float = 50;
var suspensionSpringFront : float = 18500;
var suspensionSpringRear : float = 9000;

var throttle : float = 0; 
private var steer : float = 0;

var centerOfMass : Transform;

var frontWheels : Transform[];
var rearWheels : Transform[];

private var wheels : Wheel[];
wheels = new Wheel[frontWheels.Length + rearWheels.Length];

private var wfc : WheelFrictionCurve;

var topSpeed : float = 160;

var resetTime : float = 5.0;
private var resetTimer : float = 0.0;

var forwardStiffness = 500;
var sidewayStiffness = 100;

var motorTorque = 500;
var brakeTorque = 500;
var defaultTorque = 100;

var maxRPM = 300;
var maxTurn = 15;

var truckSpeed:float;

class Wheel
{
	var collider : WheelCollider;
	var wheelGraphic : Transform;
	var tireGraphic : Transform;
	var driveWheel : boolean = false;
	var steerWheel : boolean = false;
	var lastEmitPosition : Vector3 = Vector3.zero;
	var lastEmitTime : float = Time.time;
	var wheelVelo : Vector3 = Vector3.zero;
	var groundSpeed : Vector3 = Vector3.zero;
}

function Start()
{	
	SetupWheelColliders();
	
	SetupCenterOfMass();
	
	topSpeed = topSpeed * 1000 / 60.0;
	
	BroadcastMessage("SetOwner", transform, SendMessageOptions.DontRequireReceiver);
}

function Update()
{
	truckSpeed = rigidbody.velocity.magnitude * 3600 / 1000;
	var relativeVelocity : Vector3 = transform.InverseTransformDirection(rigidbody.velocity);
	
	Check_If_Car_Is_Flipped();
	
	UpdateWheelGraphics(relativeVelocity);
}

function FixedUpdate()
{	
	// The rigidbody velocity is always given in world space, but in order to work in local space of the car model we need to transform it first.
	var relativeVelocity : Vector3 = transform.InverseTransformDirection(rigidbody.velocity);
	
	ApplyThrottle(relativeVelocity);
	ApplySteering(relativeVelocity);
}

/**************************************************/
/* Functions called from Start()                  */
/**************************************************/

function SetupWheelColliders()
{
	SetupWheelFrictionCurve();
		
	var wheelCount : int = 0;
	
	for (var t : Transform in frontWheels)
	{
		wheels[wheelCount] = SetupWheel(t, true);
		wheelCount++;
	}
	
	for (var t : Transform in rearWheels)
	{
		wheels[wheelCount] = SetupWheel(t, false);
		wheelCount++;
	}
}

function SetupWheelFrictionCurve()
{
	wfc = new WheelFrictionCurve();
	wfc.extremumSlip = 1;
	wfc.extremumValue = 2;
	wfc.asymptoteSlip = 2;
	wfc.asymptoteValue = 1;
	wfc.stiffness = 1;
}

function SetupWheel(wheelTransform : Transform, isFrontWheel : boolean)
{
	var go : GameObject = new GameObject(wheelTransform.name + " Collider");
	go.transform.position = wheelTransform.position;
	go.transform.parent = transform;
	go.transform.rotation = wheelTransform.rotation;
		
	var wc : WheelCollider = go.AddComponent(typeof(WheelCollider)) as WheelCollider;
	wc.suspensionDistance = suspensionRange;
	var js : JointSpring = wc.suspensionSpring;
	
	if (isFrontWheel)
		js.spring = suspensionSpringFront;
	else
		js.spring = suspensionSpringRear;
		
	js.damper = suspensionDamper;
	wc.suspensionSpring = js;
		
	var wheel = new Wheel(); 
	wheel.collider = wc;
	wc.sidewaysFriction = wfc;
	wc.sidewaysFriction.stiffness = sidewayStiffness;
	wc.forwardFriction = wfc;
	wc.forwardFriction.stiffness = forwardStiffness;
	wheel.wheelGraphic = wheelTransform;
	
	var tmpTransforms = wheelTransform.GetComponentsInChildren(Transform);
	wheel.tireGraphic = tmpTransforms[1] as Transform;
	var wheelRadius = 0.0;
	for(var tmpTransform : Component in tmpTransforms) {
		if (tmpTransform == tmpTransforms[0]) {
			continue;
		}
		if (!!tmpTransform.renderer) {
			wheelRadius = tmpTransform.renderer.bounds.size.y / 2;	
			break;		
		}
	}
	wheel.collider.radius = wheelRadius;
	
	if (isFrontWheel) {
		wheel.steerWheel = true;
	}
	else {
		wheel.driveWheel = true;
	}
		
	return wheel;
}

function SetupCenterOfMass()
{
	if(centerOfMass != null)
		rigidbody.centerOfMass = centerOfMass.localPosition;
}

/**************************************************/
/* Functions called from Update()                 */
/**************************************************/

function GetInput(input:float[])
{
	throttle = input[0];
	steer = input[1];
}

function Check_If_Car_Is_Flipped()
{
	if(transform.localEulerAngles.z > 80 && transform.localEulerAngles.z < 280)
		resetTimer += Time.deltaTime;
	else
		resetTimer = 0;
	
	if(resetTimer > resetTime)
		FlipCar();
}

function FlipCar()
{
	transform.rotation = Quaternion.LookRotation(transform.forward);
	transform.position += Vector3.up * 0.5;
	rigidbody.velocity = Vector3.zero;
	rigidbody.angularVelocity = Vector3.zero;
	resetTimer = 0;
}

var wheelCount : float;
function UpdateWheelGraphics(relativeVelocity : Vector3)
{
	wheelCount = -1;
	
	for(var w : Wheel in wheels)
	{
		wheelCount++;
		var wheel2 : WheelCollider = w.collider;
		
		w.tireGraphic.Rotate(Vector3.right * (wheel2.rpm / 60.0 * Time.deltaTime / wheel2.radius * 460));
		
		if (w.steerWheel) {
			w.wheelGraphic.localEulerAngles.y = steer * maxTurn;
		}
	}
}

var rpmMonitor : float;

function getMotorTorque(torque:float, rpm:float) {

	return (maxRPM - Mathf.Min(maxRPM, Mathf.Abs(rpm))) / maxRPM * torque;
}

function ApplyThrottle(relativeVelocity : Vector3)
{
	for(var index = 0; index < wheels.length; index++)
	{
		var w = wheels[index];
		var flag = HaveTheSameSign(relativeVelocity.z, throttle) || Mathf.Abs(relativeVelocity.z) < 1;
		var multiplier = throttle; 
		
		w.collider.motorTorque = flag?multiplier * Mathf.Sign(motorTorque) * (getMotorTorque(Mathf.Max(Mathf.Abs(motorTorque) - defaultTorque, 0), w.collider.rpm) + defaultTorque):0;
		w.collider.brakeTorque = (!flag?(brakeTorque - defaultTorque) * Mathf.Abs(throttle):0) + defaultTorque;
	}	
	rpmMonitor = wheels.Length > 0?wheels[0].collider.rpm:0;
}

function ApplySteering(relativeVelocity : Vector3)
{
	for(var index = 0; index < wheels.length; index++)
	{
		var w = wheels[index];
		if (w.steerWheel) {
			w.collider.steerAngle = steer * maxTurn;		
		}
	}	

}

/**************************************************/
/*               Utility Functions                */
/**************************************************/

function HaveTheSameSign(first : float, second : float) : boolean
{
	if (Mathf.Sign(first) == Mathf.Sign(second))
		return true;
	else
		return false;
}